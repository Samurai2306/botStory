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
    
    # Relationships
    level_progress = relationship("LevelProgress", back_populates="user", cascade="all, delete-orphan")
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
