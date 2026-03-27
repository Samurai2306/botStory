from sqlalchemy import Column, Integer, String, Boolean, Text, ForeignKey, DateTime, Enum, JSON, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from datetime import datetime
import enum
from app.db.database import Base


class UserRole(str, enum.Enum):
    GUEST = "guest"
    USER = "user"
    ADMIN = "admin"


class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    username = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(Enum(UserRole), default=UserRole.USER, nullable=False)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
    is_active = Column(Boolean, default=True)
    hint_word = Column(String(100), nullable=True)  # Одно слово-подсказка для всех уровней
    locale = Column(String(10), nullable=False, server_default="ru")
    terminal_theme = Column(String(20), nullable=False, server_default="linux")
    bio = Column(Text, nullable=True)
    tagline = Column(String(120), nullable=True)
    profile_preferences = Column(JSON, nullable=True)

    # Relationships
    level_progress = relationship("LevelProgress", back_populates="user", cascade="all, delete-orphan")
    user_achievements = relationship("UserAchievement", back_populates="user", cascade="all, delete-orphan")
    equipped_titles = relationship("UserEquippedTitle", back_populates="user", cascade="all, delete-orphan")
    held_title_states = relationship(
        "TitleHolderState", back_populates="holder", foreign_keys="TitleHolderState.holder_user_id"
    )
    level_words = relationship("LevelWords", back_populates="user", cascade="all, delete-orphan")
    notes = relationship("Note", back_populates="user", cascade="all, delete-orphan")
    highlights = relationship("Highlight", back_populates="user", cascade="all, delete-orphan")
    messages = relationship("Message", back_populates="user", cascade="all, delete-orphan")
    community_posts = relationship("CommunityPost", back_populates="author", cascade="all, delete-orphan")
    community_comments = relationship("CommunityComment", back_populates="author", cascade="all, delete-orphan")
    post_likes = relationship("CommunityPostLike", back_populates="user", cascade="all, delete-orphan")
    community_polls = relationship("CommunityPoll", back_populates="author", cascade="all, delete-orphan")
    poll_votes = relationship("CommunityPollVote", back_populates="user", cascade="all, delete-orphan")


class Level(Base):
    __tablename__ = "levels"
    
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    description = Column(Text)
    narrative = Column(Text, nullable=False)  # Предыстория для брифинга
    order = Column(Integer, nullable=False, unique=True)
    difficulty = Column(Integer, default=1)
    
    # Игровая карта (JSON структура)
    map_data = Column(JSON, nullable=False)
    
    # Золотой эталон - идеальное решение
    golden_code = Column(Text, nullable=False)
    golden_steps_count = Column(Integer, nullable=False)
    
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
    is_active = Column(Boolean, default=True)
    
    # Relationships
    level_progress = relationship("LevelProgress", back_populates="level", cascade="all, delete-orphan")
    messages = relationship("Message", back_populates="level", cascade="all, delete-orphan")
    notes = relationship("Note", back_populates="level")
    highlights = relationship("Highlight", back_populates="level")
    level_words = relationship("LevelWords", back_populates="level", cascade="all, delete-orphan")


class LevelProgress(Base):
    __tablename__ = "level_progress"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    level_id = Column(Integer, ForeignKey("levels.id"), nullable=False)
    
    completed = Column(Boolean, default=False)
    steps_count = Column(Integer)  # Количество шагов в решении игрока
    user_code = Column(Text)  # Код игрока
    
    attempts = Column(Integer, default=0)
    best_steps_count = Column(Integer)  # Лучший результат
    completed_ever_without_loops = Column(Boolean, default=False, nullable=False, server_default="false")

    completed_at = Column(DateTime)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
    
    # Relationships
    user = relationship("User", back_populates="level_progress")
    level = relationship("Level", back_populates="level_progress")


class NoteType(str, enum.Enum):
    HIGHLIGHT = "highlight"
    CUSTOM = "custom"
    TEMPLATE = "template"


class Note(Base):
    __tablename__ = "notes"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    level_id = Column(Integer, ForeignKey("levels.id"))
    
    content = Column(Text, nullable=False)
    type = Column(Enum(NoteType), default=NoteType.CUSTOM)
    
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
    
    # Relationships
    user = relationship("User", back_populates="notes")
    level = relationship("Level", back_populates="notes")


class HighlightColor(str, enum.Enum):
    RED = "red"
    YELLOW = "yellow"
    GREEN = "green"


class Highlight(Base):
    __tablename__ = "highlights"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    level_id = Column(Integer, ForeignKey("levels.id"), nullable=False)
    
    text_fragment = Column(Text, nullable=False)
    color = Column(Enum(HighlightColor), default=HighlightColor.YELLOW)
    
    # Позиция в тексте для точного восстановления выделения
    char_start = Column(Integer, nullable=False)
    char_end = Column(Integer, nullable=False)
    
    created_at = Column(DateTime, default=func.now())
    
    # Relationships
    user = relationship("User", back_populates="highlights")
    level = relationship("Level", back_populates="highlights")


class LevelWords(Base):
    __tablename__ = "level_words"
    __table_args__ = (UniqueConstraint("user_id", "level_id", name="uq_level_words_user_level"),)

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    level_id = Column(Integer, ForeignKey("levels.id"), nullable=False)
    words = Column(JSON, nullable=False)  # список до 10 слов: ["word1", "word2", ...]

    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    user = relationship("User", back_populates="level_words")
    level = relationship("Level", back_populates="level_words")


class Message(Base):
    __tablename__ = "messages"
    
    id = Column(Integer, primary_key=True, index=True)
    level_id = Column(Integer, ForeignKey("levels.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    content = Column(Text, nullable=False)
    is_spoiler = Column(Boolean, default=False)  # Сообщение помечено как спойлер
    
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
    is_deleted = Column(Boolean, default=False)
    
    # Relationships
    user = relationship("User", back_populates="messages")
    level = relationship("Level", back_populates="messages")


class News(Base):
    __tablename__ = "news"
    
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    author_id = Column(Integer, ForeignKey("users.id"))
    
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
    is_published = Column(Boolean, default=False)


class PostCategory(str, enum.Enum):
    DISCUSSION = "discussion"   # Обсуждение
    QUESTION = "question"      # Вопрос
    IDEA = "idea"              # Идея
    ANNOUNCEMENT = "announcement"  # Объявление


class CommunityPost(Base):
    __tablename__ = "community_posts"
    
    id = Column(Integer, primary_key=True, index=True)
    author_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    title = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    category = Column(Enum(PostCategory), default=PostCategory.DISCUSSION)
    pinned = Column(Boolean, default=False)  # Закреплённый пост (админ)
    
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
    
    author = relationship("User", back_populates="community_posts")
    comments = relationship("CommunityComment", back_populates="post", cascade="all, delete-orphan", order_by="CommunityComment.created_at")
    likes = relationship("CommunityPostLike", back_populates="post", cascade="all, delete-orphan")


class CommunityComment(Base):
    __tablename__ = "community_comments"
    
    id = Column(Integer, primary_key=True, index=True)
    post_id = Column(Integer, ForeignKey("community_posts.id"), nullable=False)
    author_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    parent_id = Column(Integer, ForeignKey("community_comments.id"), nullable=True)  # ответ на комментарий
    content = Column(Text, nullable=False)
    
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
    
    post = relationship("CommunityPost", back_populates="comments")
    author = relationship("User", back_populates="community_comments")
    parent = relationship("CommunityComment", remote_side=[id], backref="replies")


class CommunityPostLike(Base):
    __tablename__ = "community_post_likes"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    post_id = Column(Integer, ForeignKey("community_posts.id"), nullable=False)
    
    created_at = Column(DateTime, default=func.now())
    
    user = relationship("User", back_populates="post_likes")
    post = relationship("CommunityPost", back_populates="likes")


class CommunityPoll(Base):
    __tablename__ = "community_polls"
    id = Column(Integer, primary_key=True, index=True)
    author_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    closed = Column(Boolean, default=False)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
    author = relationship("User", back_populates="community_polls")
    options = relationship("CommunityPollOption", back_populates="poll", cascade="all, delete-orphan", order_by="CommunityPollOption.order")
    votes = relationship("CommunityPollVote", back_populates="poll", cascade="all, delete-orphan")


class CommunityPollOption(Base):
    __tablename__ = "community_poll_options"
    id = Column(Integer, primary_key=True, index=True)
    poll_id = Column(Integer, ForeignKey("community_polls.id"), nullable=False)
    text = Column(String, nullable=False)
    order = Column(Integer, default=0)
    poll = relationship("CommunityPoll", back_populates="options")
    votes = relationship("CommunityPollVote", back_populates="option", cascade="all, delete-orphan")


class CommunityPollVote(Base):
    __tablename__ = "community_poll_votes"
    __table_args__ = (UniqueConstraint("user_id", "poll_id", name="uq_poll_vote_user_poll"),)
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    poll_id = Column(Integer, ForeignKey("community_polls.id"), nullable=False)
    option_id = Column(Integer, ForeignKey("community_poll_options.id"), nullable=False)
    created_at = Column(DateTime, default=func.now())
    user = relationship("User", back_populates="poll_votes")
    poll = relationship("CommunityPoll", back_populates="votes")
    option = relationship("CommunityPollOption", back_populates="votes")


# --- Achievements & titles ---


class AchievementCategory(str, enum.Enum):
    SOCIAL = "social"
    PROGRESSION = "progression"
    EFFICIENCY = "efficiency"
    HARDCORE = "hardcore"


class AchievementTriggerType(str, enum.Enum):
    COMMUNITY_LIKES_ON_OWN_POSTS = "community_likes_on_own_posts"
    LEVEL_CHAT_MESSAGES = "level_chat_messages"
    COMMUNITY_COMMENTS_ON_OTHERS_POSTS = "community_comments_on_others_posts"
    ALL_LEVELS_DIFFICULTY_COMPLETED = "all_levels_difficulty_completed"
    BEAT_GOLDEN_ONCE = "beat_golden_once"
    BEAT_GOLDEN_DISTINCT = "beat_golden_distinct"
    GOLDEN_PARITY = "golden_parity"
    NO_LOOP_HARD_ONCE = "no_loop_hard_once"
    ALL_DIFFICULTIES_NO_LOOP = "all_difficulties_no_loop"
    CONSECUTIVE_NO_LOOP_STREAK = "consecutive_no_loop_streak"


class TitleHolderMode(str, enum.Enum):
    UNIQUE_TRANSFERABLE = "unique_transferable"
    LIMITED_POOL = "limited_pool"


class TitleLeaderMetric(str, enum.Enum):
    GLOBAL_MIN_SUM_BEST_STEPS_ALL_COMPLETED = "global_min_sum_best_steps_all_completed"
    MIN_BEST_STEPS_ON_BOSS_LEVEL = "min_best_steps_on_boss_level"
    MIN_SUM_BEST_NO_LOOP_DIFF_1_3 = "min_sum_best_no_loop_diff_1_3"
    MAX_POST_LIKES_WINDOW_DAYS = "max_post_likes_window_days"
    MAX_COMMENTS_WINDOW_DAYS = "max_comments_window_days"


class AchievementDefinition(Base):
    __tablename__ = "achievement_definitions"

    id = Column(Integer, primary_key=True, index=True)
    slug = Column(String(80), unique=True, nullable=False, index=True)
    category = Column(String(32), nullable=False)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=False)
    icon_key = Column(String(64), nullable=True)
    rarity = Column(String(32), nullable=True)
    trigger_type = Column(String(64), nullable=False)
    trigger_config = Column(JSON, nullable=True)
    is_hidden = Column(Boolean, default=False, nullable=False, server_default="false")

    user_achievements = relationship("UserAchievement", back_populates="achievement")


class UserAchievement(Base):
    __tablename__ = "user_achievements"
    __table_args__ = (UniqueConstraint("user_id", "achievement_id", name="uq_user_achievement"),)

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    achievement_id = Column(Integer, ForeignKey("achievement_definitions.id"), nullable=False)
    earned_at = Column(DateTime, default=func.now(), nullable=False)
    context = Column(JSON, nullable=True)

    user = relationship("User", back_populates="user_achievements")
    achievement = relationship("AchievementDefinition", back_populates="user_achievements")


class TitleDefinition(Base):
    __tablename__ = "title_definitions"

    id = Column(Integer, primary_key=True, index=True)
    slug = Column(String(80), unique=True, nullable=False, index=True)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=False)
    holder_mode = Column(String(32), nullable=False)
    max_holders = Column(Integer, nullable=False, server_default="1")
    leader_metric = Column(String(64), nullable=False)
    metric_config = Column(JSON, nullable=True)
    icon_key = Column(String(64), nullable=True)

    holder_state = relationship("TitleHolderState", back_populates="title", uselist=False)
    equipped_by = relationship("UserEquippedTitle", back_populates="title")


class TitleHolderState(Base):
    __tablename__ = "title_holder_state"

    title_id = Column(Integer, ForeignKey("title_definitions.id"), primary_key=True)
    holder_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    since_at = Column(DateTime, nullable=True)
    metric_value = Column(JSON, nullable=True)

    title = relationship("TitleDefinition", back_populates="holder_state")
    holder = relationship("User", back_populates="held_title_states", foreign_keys=[holder_user_id])


class TitleHolderHistory(Base):
    __tablename__ = "title_holder_history"

    id = Column(Integer, primary_key=True, index=True)
    title_id = Column(Integer, ForeignKey("title_definitions.id"), nullable=False)
    from_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    to_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    changed_at = Column(DateTime, default=func.now(), nullable=False)
    reason = Column(String(64), nullable=True)
    metric_value = Column(JSON, nullable=True)


class UserEquippedTitle(Base):
    __tablename__ = "user_equipped_titles"
    __table_args__ = (
        UniqueConstraint("user_id", "slot", name="uq_user_equipped_slot"),
        UniqueConstraint("user_id", "title_id", name="uq_user_equipped_title"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    slot = Column(Integer, nullable=False)
    title_id = Column(Integer, ForeignKey("title_definitions.id"), nullable=False)

    user = relationship("User", back_populates="equipped_titles")
    title = relationship("TitleDefinition", back_populates="equipped_by")
