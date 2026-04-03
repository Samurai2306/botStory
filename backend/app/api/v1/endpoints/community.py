from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, status, Query, Response
from sqlalchemy.orm import Session, joinedload, selectinload
from sqlalchemy import func, desc
from typing import List, Optional
import re

from app.db.database import get_db
from app.db.models import (
    User, UserRole, CommunityPost, CommunityComment, CommunityPostLike, PostCategory,
    CommunityPoll, CommunityPollOption, CommunityPollVote,
    CommunityMention, CommunityMentionTargetType, UserNotification, UserNotificationType,
    CommunityPostBookmark, CommunityCategorySubscription, CommunityReputationEvent, CommunityReputationReason,
    TitleDefinition, TitleHolderState, TitleHolderHistory,
    UserFriendship,
)
from app.schemas.community import (
    PostCreate, PostUpdate, PostResponse, CommentCreate, CommentResponse,
    PollCreate, PollResponse, PollOptionResponse, PollVoteCreate, PollStateUpdate,
    NotificationResponse, NotificationUnreadCountResponse, NotificationPinBody, NotificationBroadcastCreate, NotificationBroadcastResult,
    NotificationBroadcastTheme,
    MentionResponse, BookmarkResponse, CategorySubscriptionResponse, ReputationLeaderboardRow, CommunityUserCard,
)
from app.core.deps import get_current_user, get_current_admin, get_optional_user
from app.core.config import settings
from app.services.gamification_hooks import sync_gamification_for_users
from app.api.v1.endpoints.users import _search_users_query

router = APIRouter()
MENTION_RE = re.compile(r"(?<!\w)@([A-Za-z0-9_]{2,30})")

# Ежемесячная очистка: удаляются только незакреплённые уведомления
NOTIFICATION_INBOX_PURGE_INTERVAL_DAYS = 30

_BROADCAST_THEME_TO_TYPE: dict[NotificationBroadcastTheme, UserNotificationType] = {
    NotificationBroadcastTheme.SYSTEM: UserNotificationType.SYSTEM,
    NotificationBroadcastTheme.IMPORTANT_UPDATE: UserNotificationType.IMPORTANT_UPDATE,
    NotificationBroadcastTheme.MAINTENANCE: UserNotificationType.MAINTENANCE,
    NotificationBroadcastTheme.COMMUNITY: UserNotificationType.COMMUNITY,
    NotificationBroadcastTheme.GENERAL: UserNotificationType.GENERAL,
}


def _maybe_purge_notification_inbox(db: Session, user_id: int) -> None:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return
    now = datetime.utcnow()
    last = user.notification_inbox_last_purge_at
    if last is None:
        user.notification_inbox_last_purge_at = now
        db.commit()
        return
    if (now - last) < timedelta(days=NOTIFICATION_INBOX_PURGE_INTERVAL_DAYS):
        return
    db.query(UserNotification).filter(
        UserNotification.user_id == user_id,
        UserNotification.is_pinned.is_(False),
    ).delete(synchronize_session=False)
    user.notification_inbox_last_purge_at = now
    db.commit()


def _avatar_url_for(key: str | None) -> str | None:
    return f"/api/v1/users/avatars/{key}.svg" if key else None


def _grant_reputation(db: Session, user_id: int, reason: CommunityReputationReason, points: int, source_type: str, source_id: int) -> None:
    db.add(
        CommunityReputationEvent(
            user_id=user_id,
            reason=reason,
            points=points,
            source_type=source_type,
            source_id=source_id,
        )
    )
    user = db.query(User).filter(User.id == user_id).first()
    if user:
        user.reputation_score = int(user.reputation_score or 0) + points
    _sync_reputation_leader_title(db)


def _emit_notification(db: Session, user_id: int, n_type: UserNotificationType, title: str, body: str | None = None, payload: dict | None = None) -> None:
    db.add(
        UserNotification(
            user_id=user_id,
            type=n_type,
            title=title,
            body=body,
            payload=payload or {},
        )
    )


def _sync_reputation_leader_title(db: Session) -> None:
    slug = "community_reputation_leader"
    title = db.query(TitleDefinition).filter(TitleDefinition.slug == slug).first()
    if not title:
        title = TitleDefinition(
            slug=slug,
            name="Голос сообщества",
            description="Титул лидера по репутации в сообществе.",
            holder_mode="unique_transferable",
            max_holders=1,
            leader_metric="community_reputation_max",
        )
        db.add(title)
        db.flush()
    leader = db.query(User).order_by(desc(User.reputation_score), User.id.asc()).first()
    if not leader:
        return
    state = db.query(TitleHolderState).filter(TitleHolderState.title_id == title.id).first()
    prev_holder = state.holder_user_id if state else None
    if state is None:
        state = TitleHolderState(title_id=title.id)
        db.add(state)
    if prev_holder == leader.id:
        state.metric_value = {"reputation_score": int(leader.reputation_score or 0)}
        return
    state.holder_user_id = leader.id
    state.since_at = datetime.utcnow()
    state.metric_value = {"reputation_score": int(leader.reputation_score or 0)}
    db.add(
        TitleHolderHistory(
            title_id=title.id,
            from_user_id=prev_holder,
            to_user_id=leader.id,
            reason="reputation_recalc",
            metric_value=state.metric_value,
        )
    )


def _sync_mentions_for_target(
    db: Session,
    *,
    target_type: CommunityMentionTargetType,
    target_id: int,
    content: str,
    author_user_id: int,
) -> None:
    usernames = sorted(set(MENTION_RE.findall(content or "")))
    mentioned_users = db.query(User).filter(User.username.in_(usernames)).all() if usernames else []
    existing = db.query(CommunityMention).filter(
        CommunityMention.target_type == target_type,
        CommunityMention.target_id == target_id,
    ).all()
    existing_ids = {m.target_user_id for m in existing}
    keep_ids = {u.id for u in mentioned_users if u.id != author_user_id}
    for m in existing:
        if m.target_user_id not in keep_ids:
            db.delete(m)
    for u in mentioned_users:
        if u.id == author_user_id or u.id in existing_ids:
            continue
        db.add(
            CommunityMention(
                target_type=target_type,
                target_id=target_id,
                target_user_id=u.id,
                author_user_id=author_user_id,
            )
        )
        _emit_notification(
            db,
            user_id=u.id,
            n_type=UserNotificationType.MENTION,
            title="Вас упомянули в сообществе",
            body=f"@{u.username}, вас отметил пользователь в обсуждении.",
            payload={"target_type": target_type.value, "target_id": target_id},
        )


def _friend_pair(user_id_1: int, user_id_2: int) -> tuple[int, int]:
    return (user_id_1, user_id_2) if user_id_1 < user_id_2 else (user_id_2, user_id_1)


def _friend_ids_for(db: Session, user_id: int) -> set[int]:
    rows = db.query(UserFriendship).filter((UserFriendship.user_a_id == user_id) | (UserFriendship.user_b_id == user_id)).all()
    out: set[int] = set()
    for fr in rows:
        out.add(fr.user_b_id if fr.user_a_id == user_id else fr.user_a_id)
    return out


def _post_to_response(post: CommunityPost, db: Session, current_user_id: Optional[int] = None) -> PostResponse:
    likes_count = db.query(CommunityPostLike).filter(CommunityPostLike.post_id == post.id).count()
    comments_count = db.query(CommunityComment).filter(CommunityComment.post_id == post.id).count()
    liked_by_me = False
    bookmarked_by_me = False
    if current_user_id:
        liked_by_me = db.query(CommunityPostLike).filter(
            CommunityPostLike.post_id == post.id,
            CommunityPostLike.user_id == current_user_id
        ).first() is not None
        bookmarked_by_me = db.query(CommunityPostBookmark).filter(
            CommunityPostBookmark.post_id == post.id,
            CommunityPostBookmark.user_id == current_user_id,
        ).first() is not None
    return PostResponse(
        id=post.id,
        author_id=post.author_id,
        title=post.title,
        content=post.content,
        category=post.category,
        pinned=post.pinned,
        created_at=post.created_at,
        updated_at=post.updated_at,
        likes_count=likes_count,
        comments_count=comments_count,
        author_username=post.author.username if post.author else None,
        author_avatar_url=_avatar_url_for(post.author.avatar_key) if post.author else None,
        liked_by_me=liked_by_me,
        bookmarked_by_me=bookmarked_by_me,
    )


@router.get("/posts", response_model=List[PostResponse])
async def list_posts(
    category: Optional[PostCategory] = None,
    author_id: Optional[int] = None,
    q: Optional[str] = None,
    sort: str = Query("new", enum=["new", "popular", "pinned_first"]),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=settings.PAGINATION_MAX_LIMIT_GENERAL),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_user)
):
    """Список постов сообщества. Сортировка: new (сначала новые), popular (по лайкам), pinned_first (закреплённые сверху)."""
    query = db.query(CommunityPost)
    if category is not None:
        query = query.filter(CommunityPost.category == category)
    if author_id is not None:
        query = query.filter(CommunityPost.author_id == author_id)
    if q:
        needle = f"%{q.strip()}%"
        query = query.filter((CommunityPost.title.ilike(needle)) | (CommunityPost.content.ilike(needle)))
    if sort == "popular":
        subq = db.query(
            CommunityPostLike.post_id,
            func.count(CommunityPostLike.id).label("likes")
        ).group_by(CommunityPostLike.post_id).subquery()
        query = query.outerjoin(subq, CommunityPost.id == subq.c.post_id).order_by(
            desc(subq.c.likes), desc(CommunityPost.created_at)
        )
    elif sort == "pinned_first":
        query = query.order_by(desc(CommunityPost.pinned), desc(CommunityPost.created_at))
    else:
        query = query.order_by(desc(CommunityPost.created_at))
    posts = query.offset(skip).limit(limit).all()
    uid = current_user.id if current_user else None
    return [_post_to_response(p, db, uid) for p in posts]


@router.get("/posts/{post_id}", response_model=PostResponse)
async def get_post(
    post_id: int,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_user)
):
    post = db.query(CommunityPost).filter(CommunityPost.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    uid = current_user.id if current_user else None
    return _post_to_response(post, db, uid)


@router.post("/posts", response_model=PostResponse, status_code=status.HTTP_201_CREATED)
async def create_post(
    data: PostCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    post = CommunityPost(
        author_id=current_user.id,
        title=data.title,
        content=data.content,
        category=data.category
    )
    db.add(post)
    db.commit()
    db.refresh(post)
    _grant_reputation(db, current_user.id, CommunityReputationReason.POST_CREATED, 5, "post", post.id)
    _sync_mentions_for_target(
        db,
        target_type=CommunityMentionTargetType.POST,
        target_id=post.id,
        content=f"{post.title}\n{post.content}",
        author_user_id=current_user.id,
    )
    db.commit()
    return _post_to_response(post, db, current_user.id)


@router.patch("/posts/{post_id}", response_model=PostResponse)
async def update_post(
    post_id: int,
    data: PostUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    post = db.query(CommunityPost).filter(CommunityPost.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    if current_user.id != post.author_id and current_user.role.value != "admin":
        raise HTTPException(status_code=403, detail="Not allowed to edit this post")
    update_data = data.model_dump(exclude_unset=True)
    if "pinned" in update_data and current_user.role.value != "admin":
        del update_data["pinned"]
    for k, v in update_data.items():
        setattr(post, k, v)
    _sync_mentions_for_target(
        db,
        target_type=CommunityMentionTargetType.POST,
        target_id=post.id,
        content=f"{post.title}\n{post.content}",
        author_user_id=current_user.id,
    )
    db.commit()
    db.refresh(post)
    return _post_to_response(post, db, current_user.id)


@router.delete("/posts/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_post(
    post_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    post = db.query(CommunityPost).filter(CommunityPost.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    if current_user.id != post.author_id and current_user.role.value != "admin":
        raise HTTPException(status_code=403, detail="Not allowed to delete this post")
    db.delete(post)
    db.commit()
    return None


@router.post("/posts/{post_id}/like", status_code=status.HTTP_204_NO_CONTENT)
async def like_post(
    post_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    post = db.query(CommunityPost).filter(CommunityPost.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    existing = db.query(CommunityPostLike).filter(
        CommunityPostLike.post_id == post_id,
        CommunityPostLike.user_id == current_user.id
    ).first()
    if existing:
        db.delete(existing)
    else:
        db.add(CommunityPostLike(user_id=current_user.id, post_id=post_id))
        if post.author_id != current_user.id:
            _grant_reputation(db, post.author_id, CommunityReputationReason.POST_LIKED, 1, "post_like", post_id)
    db.commit()
    sync_gamification_for_users(db, post.author_id)
    db.commit()
    return None


@router.get("/posts/{post_id}/comments", response_model=List[CommentResponse])
async def list_comments(
    post_id: int,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=settings.PAGINATION_MAX_LIMIT_CHAT),
    db: Session = Depends(get_db)
):
    comments = (
        db.query(CommunityComment)
        .options(joinedload(CommunityComment.parent).joinedload(CommunityComment.author))
        .filter(CommunityComment.post_id == post_id)
        .order_by(CommunityComment.created_at)
        .offset(skip)
        .limit(limit)
        .all()
    )
    return [
        CommentResponse(
            id=c.id,
            post_id=c.post_id,
            author_id=c.author_id,
            parent_id=c.parent_id,
            content=c.content,
            created_at=c.created_at,
            updated_at=c.updated_at,
            author_username=c.author.username if c.author else None,
            author_avatar_url=_avatar_url_for(c.author.avatar_key) if c.author else None,
            parent_username=c.parent.author.username if c.parent and c.parent.author else None,
            parent_avatar_url=_avatar_url_for(c.parent.author.avatar_key) if c.parent and c.parent.author else None,
        )
        for c in comments
    ]


@router.post("/posts/{post_id}/comments", response_model=CommentResponse, status_code=status.HTTP_201_CREATED)
async def create_comment(
    post_id: int,
    data: CommentCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    post = db.query(CommunityPost).filter(CommunityPost.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    parent_username = None
    parent = None
    if data.parent_id:
        parent = db.query(CommunityComment).filter(
            CommunityComment.id == data.parent_id,
            CommunityComment.post_id == post_id
        ).first()
        if not parent:
            raise HTTPException(status_code=404, detail="Parent comment not found")
        parent_username = parent.author.username if parent.author else None
    comment = CommunityComment(
        post_id=post_id,
        author_id=current_user.id,
        parent_id=data.parent_id,
        content=data.content
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)
    _grant_reputation(db, current_user.id, CommunityReputationReason.COMMENT_CREATED, 2, "comment", comment.id)
    _sync_mentions_for_target(
        db,
        target_type=CommunityMentionTargetType.COMMENT,
        target_id=comment.id,
        content=comment.content,
        author_user_id=current_user.id,
    )
    if parent and parent.author_id != current_user.id:
        _emit_notification(
            db,
            user_id=parent.author_id,
            n_type=UserNotificationType.COMMENT_REPLY,
            title="Новый ответ на ваш комментарий",
            body=f"Пользователь @{current_user.username} ответил вам.",
            payload={"post_id": post_id, "comment_id": comment.id},
        )
    db.commit()
    sync_gamification_for_users(db, current_user.id)
    db.commit()
    return CommentResponse(
        id=comment.id,
        post_id=comment.post_id,
        author_id=comment.author_id,
        parent_id=comment.parent_id,
        content=comment.content,
        created_at=comment.created_at,
        updated_at=comment.updated_at,
        author_username=current_user.username,
        author_avatar_url=_avatar_url_for(current_user.avatar_key),
        parent_username=parent_username
    )


@router.delete("/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_comment(
    comment_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    comment = db.query(CommunityComment).filter(CommunityComment.id == comment_id).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    if current_user.id != comment.author_id and current_user.role.value != "admin":
        raise HTTPException(status_code=403, detail="Not allowed to delete this comment")
    db.delete(comment)
    db.commit()
    return None


@router.get("/mentions", response_model=List[MentionResponse])
async def list_my_mentions(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=settings.PAGINATION_MAX_LIMIT_GENERAL),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(CommunityMention)
        .options(joinedload(CommunityMention.author_user))
        .filter(CommunityMention.target_user_id == current_user.id)
        .order_by(desc(CommunityMention.created_at))
        .offset(skip)
        .limit(limit)
        .all()
    )
    return [
        MentionResponse(
            id=r.id,
            target_type=r.target_type.value,
            target_id=r.target_id,
            target_user_id=r.target_user_id,
            author_user_id=r.author_user_id,
            author_username=r.author_user.username if r.author_user else None,
            created_at=r.created_at,
            is_read=r.is_read,
        )
        for r in rows
    ]


@router.post("/mentions/{mention_id}/read", status_code=status.HTTP_204_NO_CONTENT)
async def mark_mention_read(
    mention_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    mention = db.query(CommunityMention).filter(
        CommunityMention.id == mention_id,
        CommunityMention.target_user_id == current_user.id,
    ).first()
    if not mention:
        raise HTTPException(status_code=404, detail="Mention not found")
    mention.is_read = True
    db.commit()
    return None


@router.get("/notifications", response_model=List[NotificationResponse])
async def list_my_notifications(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=settings.PAGINATION_MAX_LIMIT_GENERAL),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _maybe_purge_notification_inbox(db, current_user.id)
    rows = (
        db.query(UserNotification)
        .filter(UserNotification.user_id == current_user.id)
        .order_by(desc(UserNotification.is_pinned), desc(UserNotification.created_at))
        .offset(skip)
        .limit(limit)
        .all()
    )
    return [
        NotificationResponse(
            id=r.id,
            type=r.type.value if hasattr(r.type, "value") else str(r.type),
            title=r.title,
            body=r.body,
            payload=r.payload,
            is_read=r.is_read,
            is_pinned=bool(r.is_pinned),
            created_at=r.created_at,
        )
        for r in rows
    ]


@router.post("/notifications/broadcast", response_model=NotificationBroadcastResult, status_code=status.HTTP_201_CREATED)
async def broadcast_notifications(
    data: NotificationBroadcastCreate,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Рассылка уведомления всем активным пользователям (кроме гостей). Только админ."""
    users = (
        db.query(User)
        .filter(User.is_active.is_(True))
        .filter(User.role != UserRole.GUEST)
        .all()
    )
    n_type = _BROADCAST_THEME_TO_TYPE[data.theme]
    payload = {
        "admin_broadcast": True,
        "admin_id": current_user.id,
        "admin_username": current_user.username,
        "broadcast_theme": data.theme.value,
    }
    title = data.title.strip()
    body = (data.body.strip() if data.body else None) or None
    for u in users:
        _emit_notification(
            db,
            user_id=u.id,
            n_type=n_type,
            title=title,
            body=body,
            payload=payload,
        )
    db.commit()
    return NotificationBroadcastResult(recipients=len(users))


@router.post("/notifications/{notification_id}/read", status_code=status.HTTP_204_NO_CONTENT)
async def mark_notification_read(
    notification_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    row = db.query(UserNotification).filter(
        UserNotification.id == notification_id,
        UserNotification.user_id == current_user.id,
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Notification not found")
    row.is_read = True
    db.commit()
    return None


@router.delete("/notifications/{notification_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_notification(
    notification_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    row = db.query(UserNotification).filter(
        UserNotification.id == notification_id,
        UserNotification.user_id == current_user.id,
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Notification not found")
    db.delete(row)
    db.commit()
    return None


@router.get("/notifications/unread-count", response_model=NotificationUnreadCountResponse)
async def get_unread_notifications_count(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _maybe_purge_notification_inbox(db, current_user.id)
    unread_count = (
        db.query(func.count(UserNotification.id))
        .filter(
            UserNotification.user_id == current_user.id,
            UserNotification.is_read.is_(False),
        )
        .scalar()
        or 0
    )
    return NotificationUnreadCountResponse(unread_count=int(unread_count))


@router.post("/notifications/{notification_id}/pin", response_model=NotificationResponse)
async def set_notification_pinned(
    notification_id: int,
    body: NotificationPinBody,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    row = db.query(UserNotification).filter(
        UserNotification.id == notification_id,
        UserNotification.user_id == current_user.id,
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Notification not found")
    row.is_pinned = body.pinned
    db.commit()
    db.refresh(row)
    return NotificationResponse(
        id=row.id,
        type=row.type.value if hasattr(row.type, "value") else str(row.type),
        title=row.title,
        body=row.body,
        payload=row.payload,
        is_read=row.is_read,
        is_pinned=bool(row.is_pinned),
        created_at=row.created_at,
    )


@router.get("/bookmarks", response_model=List[BookmarkResponse])
async def list_bookmarks(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(CommunityPostBookmark)
        .filter(CommunityPostBookmark.user_id == current_user.id)
        .order_by(desc(CommunityPostBookmark.created_at))
        .all()
    )
    return [BookmarkResponse(post_id=r.post_id, created_at=r.created_at) for r in rows]


@router.post("/posts/{post_id}/bookmark", status_code=status.HTTP_204_NO_CONTENT)
async def toggle_bookmark(
    post_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    post = db.query(CommunityPost).filter(CommunityPost.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    existing = db.query(CommunityPostBookmark).filter(
        CommunityPostBookmark.user_id == current_user.id,
        CommunityPostBookmark.post_id == post_id,
    ).first()
    if existing:
        db.delete(existing)
    else:
        db.add(CommunityPostBookmark(user_id=current_user.id, post_id=post_id))
    db.commit()
    return None


@router.get("/subscriptions", response_model=List[CategorySubscriptionResponse])
async def list_category_subscriptions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(CommunityCategorySubscription)
        .filter(CommunityCategorySubscription.user_id == current_user.id)
        .order_by(CommunityCategorySubscription.created_at.desc())
        .all()
    )
    return [CategorySubscriptionResponse(category=r.category, created_at=r.created_at) for r in rows]


@router.post("/subscriptions/{category}", status_code=status.HTTP_204_NO_CONTENT)
async def toggle_category_subscription(
    category: PostCategory,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    existing = db.query(CommunityCategorySubscription).filter(
        CommunityCategorySubscription.user_id == current_user.id,
        CommunityCategorySubscription.category == category,
    ).first()
    if existing:
        db.delete(existing)
    else:
        db.add(CommunityCategorySubscription(user_id=current_user.id, category=category))
    db.commit()
    return None


@router.get("/reputation/leaderboard", response_model=List[ReputationLeaderboardRow])
async def reputation_leaderboard(
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    users = db.query(User).order_by(desc(User.reputation_score), User.id.asc()).limit(limit).all()
    return [
        ReputationLeaderboardRow(
            user_id=u.id,
            username=u.username,
            avatar_url=_avatar_url_for(u.avatar_key),
            reputation_score=int(u.reputation_score or 0),
        )
        for u in users
    ]


@router.get("/users", response_model=List[CommunityUserCard])
async def list_community_users(
    q: Optional[str] = None,
    limit: int = Query(30, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    response: Response = None,
    db: Session = Depends(get_db),
):
    response.headers["X-API-Deprecated"] = "Use /api/v1/users/search with exclude_user_id"
    if q and q.strip():
        users = _search_users_query(db, q=q, limit=limit, exclude_user_id=current_user.id)
    else:
        users = db.query(User).filter(User.id != current_user.id).order_by(User.username.asc()).limit(limit).all()
    friend_ids = _friend_ids_for(db, current_user.id)
    return [
        CommunityUserCard(
            user_id=u.id,
            username=u.username,
            avatar_url=_avatar_url_for(u.avatar_key),
            reputation_score=int(u.reputation_score or 0),
            is_friend=u.id in friend_ids,
        )
        for u in users
    ]


@router.post("/notifications/mark-read-bulk", status_code=status.HTTP_204_NO_CONTENT)
async def mark_notifications_read_bulk(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = db.query(UserNotification).filter(
        UserNotification.user_id == current_user.id,
        UserNotification.is_read == False,
    ).all()
    for n in rows:
        n.is_read = True
    db.commit()
    return None


@router.get("/friends", response_model=List[CommunityUserCard])
async def list_my_friends(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    friend_ids = _friend_ids_for(db, current_user.id)
    if not friend_ids:
        return []
    users = db.query(User).filter(User.id.in_(friend_ids)).order_by(User.username.asc()).all()
    return [
        CommunityUserCard(
            user_id=u.id,
            username=u.username,
            avatar_url=_avatar_url_for(u.avatar_key),
            reputation_score=int(u.reputation_score or 0),
            is_friend=True,
        )
        for u in users
    ]


@router.post("/friends/{target_user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def toggle_friend(
    target_user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if target_user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot add yourself")
    target = db.query(User).filter(User.id == target_user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    a, b = _friend_pair(current_user.id, target_user_id)
    existing = db.query(UserFriendship).filter(
        UserFriendship.user_a_id == a,
        UserFriendship.user_b_id == b,
    ).first()
    if existing:
        db.delete(existing)
    else:
        db.add(UserFriendship(user_a_id=a, user_b_id=b))
        _emit_notification(
            db,
            user_id=target_user_id,
            n_type=UserNotificationType.UPDATE,
            title="Новый друг в сообществе",
            body=f"Пользователь @{current_user.username} добавил вас в друзья.",
            payload={"from_user_id": current_user.id},
        )
    db.commit()
    return None

# ---- Опросы ----
def _poll_to_response(poll: CommunityPoll, db: Session, current_user_id: Optional[int] = None) -> PollResponse:
    options_data = []
    total_votes = 0
    voted_by_me = False
    my_option_id = None
    for opt in poll.options:
        votes_count = db.query(CommunityPollVote).filter(CommunityPollVote.option_id == opt.id).count()
        total_votes += votes_count
        voted_this = False
        if current_user_id:
            v = db.query(CommunityPollVote).filter(
                CommunityPollVote.option_id == opt.id,
                CommunityPollVote.user_id == current_user_id
            ).first()
            if v:
                voted_this = True
                voted_by_me = True
                my_option_id = opt.id
        options_data.append(PollOptionResponse(
            id=opt.id, poll_id=opt.poll_id, text=opt.text, order=opt.order or 0,
            votes_count=votes_count, voted_by_me=voted_this
        ))
    return PollResponse(
        id=poll.id,
        author_id=poll.author_id,
        title=poll.title,
        description=poll.description,
        closed=poll.closed,
        created_at=poll.created_at,
        updated_at=poll.updated_at,
        author_username=poll.author.username if poll.author else None,
        author_avatar_url=_avatar_url_for(poll.author.avatar_key) if poll.author else None,
        options=options_data,
        total_votes=total_votes,
        voted_by_me=voted_by_me,
        my_option_id=my_option_id,
    )


@router.get("/polls", response_model=List[PollResponse])
async def list_polls(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=settings.PAGINATION_MAX_LIMIT_GENERAL),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_user)
):
    polls = (
        db.query(CommunityPoll)
        .options(selectinload(CommunityPoll.options), joinedload(CommunityPoll.author))
        .order_by(desc(CommunityPoll.created_at))
        .offset(skip)
        .limit(limit)
        .all()
    )
    uid = current_user.id if current_user else None
    return [_poll_to_response(p, db, uid) for p in polls]


@router.get("/polls/{poll_id}", response_model=PollResponse)
async def get_poll(
    poll_id: int,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_user)
):
    poll = (
        db.query(CommunityPoll)
        .options(selectinload(CommunityPoll.options), joinedload(CommunityPoll.author))
        .filter(CommunityPoll.id == poll_id)
        .first()
    )
    if not poll:
        raise HTTPException(status_code=404, detail="Poll not found")
    return _poll_to_response(poll, db, current_user.id if current_user else None)


@router.post("/polls", response_model=PollResponse, status_code=status.HTTP_201_CREATED)
async def create_poll(
    data: PollCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if len(data.options) < 2:
        raise HTTPException(status_code=400, detail="At least 2 options required")
    poll = CommunityPoll(author_id=current_user.id, title=data.title, description=data.description)
    db.add(poll)
    db.flush()
    for i, opt in enumerate(data.options):
        db.add(CommunityPollOption(poll_id=poll.id, text=opt.text.strip(), order=i))
    db.commit()
    db.refresh(poll)
    poll = db.query(CommunityPoll).options(selectinload(CommunityPoll.options), joinedload(CommunityPoll.author)).get(poll.id)
    return _poll_to_response(poll, db, current_user.id)


@router.post("/polls/{poll_id}/vote", response_model=PollResponse)
async def vote_poll(
    poll_id: int,
    data: PollVoteCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    poll = db.query(CommunityPoll).filter(CommunityPoll.id == poll_id).first()
    if not poll:
        raise HTTPException(status_code=404, detail="Poll not found")
    if poll.closed:
        raise HTTPException(status_code=400, detail="Poll is closed")
    option = db.query(CommunityPollOption).filter(
        CommunityPollOption.id == data.option_id,
        CommunityPollOption.poll_id == poll_id
    ).first()
    if not option:
        raise HTTPException(status_code=404, detail="Option not found")
    existing = db.query(CommunityPollVote).filter(
        CommunityPollVote.poll_id == poll_id,
        CommunityPollVote.user_id == current_user.id
    ).first()
    if existing:
        existing.option_id = data.option_id
    else:
        db.add(CommunityPollVote(user_id=current_user.id, poll_id=poll_id, option_id=data.option_id))
    db.commit()
    poll = db.query(CommunityPoll).options(selectinload(CommunityPoll.options), joinedload(CommunityPoll.author)).get(poll_id)
    return _poll_to_response(poll, db, current_user.id)


@router.delete("/polls/{poll_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_poll(
    poll_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    poll = db.query(CommunityPoll).filter(CommunityPoll.id == poll_id).first()
    if not poll:
        raise HTTPException(status_code=404, detail="Poll not found")
    if current_user.id != poll.author_id and current_user.role.value != "admin":
        raise HTTPException(status_code=403, detail="Not allowed to delete this poll")
    db.delete(poll)
    db.commit()
    return None


@router.patch("/polls/{poll_id}/close", response_model=PollResponse)
async def close_poll(
    poll_id: int,
    data: PollStateUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    poll = db.query(CommunityPoll).filter(CommunityPoll.id == poll_id).first()
    if not poll:
        raise HTTPException(status_code=404, detail="Poll not found")
    if current_user.role.value != "admin" and current_user.id != poll.author_id:
        raise HTTPException(status_code=403, detail="Only admin or poll author can change poll state")
    poll.closed = data.closed
    db.commit()
    db.refresh(poll)
    return _poll_to_response(poll, db, current_user.id)


# ---- Коммиты проекта (GitHub API) ----
@router.get("/commits")
async def get_recent_commits(
    limit: int = Query(10, ge=1, le=30)
):
    """Последние коммиты репозитория (если задан GITHUB_REPO). Без авторизации."""
    from app.core.config import settings
    import httpx
    repo = getattr(settings, "GITHUB_REPO", None) or settings.model_dump().get("GITHUB_REPO")
    if not repo:
        return {"commits": [], "message": "GITHUB_REPO not configured"}
    url = f"https://api.github.com/repos/{repo}/commits?per_page={limit}"
    try:
        async with httpx.AsyncClient() as client:
            r = await client.get(url, headers={"Accept": "application/vnd.github.v3+json"}, timeout=8.0)
            if r.status_code != 200:
                return {"commits": [], "error": "GitHub API error"}
            data = r.json()
            commits = [
                {
                    "sha": c.get("sha", "")[:7],
                    "message": (c.get("commit", {}).get("message") or "").split("\n")[0],
                    "author": c.get("commit", {}).get("author", {}).get("name") or "",
                    "date": c.get("commit", {}).get("author", {}).get("date") or "",
                    "url": c.get("html_url") or "",
                }
                for c in data
            ]
            return {"commits": commits}
    except Exception:
        return {"commits": [], "error": "Failed to fetch commits"}
