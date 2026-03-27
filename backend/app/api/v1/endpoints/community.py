from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session, joinedload, selectinload
from sqlalchemy import func, desc
from typing import List, Optional

from app.db.database import get_db
from app.db.models import (
    User, CommunityPost, CommunityComment, CommunityPostLike, PostCategory,
    CommunityPoll, CommunityPollOption, CommunityPollVote,
)
from app.schemas.community import (
    PostCreate, PostUpdate, PostResponse, CommentCreate, CommentResponse,
    PollCreate, PollResponse, PollOptionResponse, PollVoteCreate,
)
from app.core.deps import get_current_user, get_optional_user
from app.services.gamification_hooks import sync_gamification_for_users

router = APIRouter()


def _post_to_response(post: CommunityPost, db: Session, current_user_id: Optional[int] = None) -> PostResponse:
    likes_count = db.query(CommunityPostLike).filter(CommunityPostLike.post_id == post.id).count()
    comments_count = db.query(CommunityComment).filter(CommunityComment.post_id == post.id).count()
    liked_by_me = False
    if current_user_id:
        liked_by_me = db.query(CommunityPostLike).filter(
            CommunityPostLike.post_id == post.id,
            CommunityPostLike.user_id == current_user_id
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
        liked_by_me=liked_by_me
    )


@router.get("/posts", response_model=List[PostResponse])
async def list_posts(
    category: Optional[PostCategory] = None,
    sort: str = Query("new", enum=["new", "popular", "pinned_first"]),
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_user)
):
    """Список постов сообщества. Сортировка: new (сначала новые), popular (по лайкам), pinned_first (закреплённые сверху)."""
    query = db.query(CommunityPost)
    if category is not None:
        query = query.filter(CommunityPost.category == category)
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
    db.commit()
    sync_gamification_for_users(db, post.author_id)
    db.commit()
    return None


@router.get("/posts/{post_id}/comments", response_model=List[CommentResponse])
async def list_comments(
    post_id: int,
    db: Session = Depends(get_db)
):
    comments = (
        db.query(CommunityComment)
        .options(joinedload(CommunityComment.parent).joinedload(CommunityComment.author))
        .filter(CommunityComment.post_id == post_id)
        .order_by(CommunityComment.created_at)
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
            parent_username=c.parent.author.username if c.parent and c.parent.author else None
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
        options=options_data,
        total_votes=total_votes,
        voted_by_me=voted_by_me,
        my_option_id=my_option_id,
    )


@router.get("/polls", response_model=List[PollResponse])
async def list_polls(
    skip: int = 0,
    limit: int = 50,
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
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    poll = db.query(CommunityPoll).filter(CommunityPoll.id == poll_id).first()
    if not poll:
        raise HTTPException(status_code=404, detail="Poll not found")
    if current_user.role.value != "admin":
        raise HTTPException(status_code=403, detail="Only admin can close polls")
    poll.closed = True
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
    except Exception as e:
        return {"commits": [], "error": str(e)}
