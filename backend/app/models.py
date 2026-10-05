from datetime import date, datetime
from enum import Enum
from typing import Optional

from pgvector.sqlalchemy import Vector
from sqlalchemy import CheckConstraint, Column, ForeignKey, Integer, UniqueConstraint
from sqlmodel import Field, Relationship, SQLModel


# Shared properties
class UserBase(SQLModel):
    email: str = Field(unique=True, index=True)
    is_active: bool = True
    is_superuser: bool = False
    full_name: str | None = None


class UserCreate(UserBase):
    password: str


class UserRegister(SQLModel):
    email: str
    password: str
    full_name: str | None = None


class UserUpdate(UserBase):
    email: str | None = None  # type: ignore
    password: str | None = None


class UserUpdateMe(SQLModel):
    full_name: str | None = None
    email: str | None = None


class UpdatePassword(SQLModel):
    current_password: str
    new_password: str


class User(UserBase, table=True):
    id: int | None = Field(default=None, primary_key=True)
    hashed_password: str
    google_sub: str | None = Field(default=None, unique=True, index=True)
    profile_image_url: str | None = None
    items: list["Item"] = Relationship(back_populates="owner")
    user_story_prompts: list["UserStoryPrompt"] = Relationship(back_populates="user")
    conversations: list["Conversation"] = Relationship(back_populates="user")
    chat_messages: list["ChatMessage"] = Relationship(back_populates="sender")
    story_summaries: list["StorySummary"] = Relationship(back_populates="user")
    contacts: list["Contact"] = Relationship(back_populates="user")


class UserMembership(SQLModel, table=True):
    """Paid plan state mirrored from a future billing provider webhook."""

    __table_args__ = (UniqueConstraint("user_id"),)
    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(
        sa_column=Column(
            Integer,
            ForeignKey("user.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
    )
    plan_code: str = Field(default="plus", max_length=32)
    status: str = Field(default="active", max_length=32)
    provider: str | None = Field(default=None, max_length=32)
    provider_customer_id: str | None = Field(default=None, unique=True, max_length=128)
    provider_subscription_id: str | None = Field(default=None, unique=True, max_length=128)
    current_period_end: datetime | None = None
    cancel_at_period_end: bool = False
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class UserPublic(UserBase):
    id: int
    profile_image_url: str | None = None
    user_story_prompts: list["UserStoryPrompt"]
    conversations: list["Conversation"]
    chat_messages: list["ChatMessage"]
    story_summaries: list["StorySummary"]
    contacts: list["Contact"]


class UsersPublic(SQLModel):
    data: list[UserPublic]
    count: int


class ItemBase(SQLModel):
    title: str
    description: str | None = None


class ItemCreate(ItemBase):
    title: str


class ItemUpdate(ItemBase):
    title: str | None = None  # type: ignore


class Item(ItemBase, table=True):
    id: int | None = Field(default=None, primary_key=True)
    title: str
    owner_id: int = Field(foreign_key="user.id", nullable=False)
    owner: User | None = Relationship(back_populates="items")


class ItemPublic(ItemBase):
    id: int
    owner_id: int


class ItemsPublic(SQLModel):
    data: list[ItemPublic]
    count: int


class Image(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    link: str
    description: str | None = None
    date: datetime = Field(default_factory=datetime.utcnow)


class ImageCreate(SQLModel):
    link: str
    description: str | None = None
    date: datetime = Field(default_factory=datetime.utcnow)


class ImageUpdate(SQLModel):
    link: str | None = None
    description: str | None = None
    date: datetime | None = Field(default_factory=datetime.utcnow)


class ImagePublic(ImageCreate):
    id: int


class ImagesPublic(SQLModel):
    data: list[ImagePublic]
    count: int


class Category(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str
    description: str | None = None
    stock_story_prompts: list["StockStoryPrompt"] = Relationship(
        back_populates="category"
    )
    user_story_prompts: list["UserStoryPrompt"] = Relationship(
        back_populates="category"
    )


class CategoryCreate(SQLModel):
    name: str
    description: str | None = None


class CategoryUpdate(SQLModel):
    name: str | None = None
    description: str | None = None


class CategoryPublic(CategoryCreate):
    id: int


class CategoriesPublic(SQLModel):
    data: list[CategoryPublic]
    count: int


class StockStoryPrompt(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    prompt: str
    category_id: int | None = Field(default=None, foreign_key="category.id")
    category: Category | None = Relationship(back_populates="stock_story_prompts")
    image_url: str | None = None  # New field for image URL


class UserStoryPrompt(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    prompt: str
    user_id: int = Field(foreign_key="user.id")
    user: User | None = Relationship(back_populates="user_story_prompts")
    category_id: int | None = Field(default=None, foreign_key="category.id")
    category: Category | None = Relationship(back_populates="user_story_prompts")
    image_url: str | None = None  # New field for image URL
    conversations: list["Conversation"] = Relationship(
        back_populates="user_story_prompt"
    )
    created_at: datetime | None = Field(default_factory=datetime.utcnow)
    modified_at: datetime | None = Field(
        default_factory=datetime.utcnow, sa_column_kwargs={"onupdate": datetime.utcnow}
    )


class UserStoryPromptCreate(SQLModel):
    prompt: str
    category_id: int | None = None
    image_url: str | None = None
    created_at: datetime | None
    modified_at: datetime | None


class UserStoryPromptUpdate(SQLModel):
    prompt: str | None = None
    category_id: int | None = None
    image_url: str | None = None


class UserStoryPromptPublic(UserStoryPromptCreate):
    id: int
    user_id: int
    category: Category | None


class UserStoryPromptsPublic(SQLModel):
    data: list[UserStoryPromptPublic]
    count: int


class ConversationStatus(str, Enum):
    INACTIVE = "inactive"
    ACTIVE = "active"
    READY_FOR_SUMMARY = "ready_for_summary"
    COMPLETE = "complete"


class Conversation(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id")
    user: User | None = Relationship(back_populates="conversations")
    user_story_prompt_id: int | None = Field(
        default=None, foreign_key="userstoryprompt.id"
    )
    user_story_prompt: UserStoryPrompt | None = Relationship(
        back_populates="conversations"
    )
    parent_conversation_id: int | None = Field(
        default=None,
        foreign_key="conversation.id",
        index=True,
    )
    parent: Optional["Conversation"] = Relationship(
        back_populates="children",
        sa_relationship_kwargs={"remote_side": "Conversation.id"},
    )
    children: list["Conversation"] = Relationship(back_populates="parent")
    node_title: str = Field(default="New memory")
    node_prompt: str | None = None
    branch_context: str | None = None
    node_depth: int = Field(default=0)
    user_turn_count: int = Field(default=0)
    ready_to_save: bool = Field(default=False)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    chat_messages: list["ChatMessage"] = Relationship(back_populates="conversation")
    status: ConversationStatus = Field(default=ConversationStatus.INACTIVE)
    story_summary: Optional["StorySummary"] = Relationship(
        back_populates="conversation"
    )
    token_total: int = Field(default=0)


class ChatMessageSender(str, Enum):
    USER = "user"
    AI = "ai"
    FINAL = "final"


class ChatMessage(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    conversation_id: int = Field(foreign_key="conversation.id")
    conversation: Conversation | None = Relationship(back_populates="chat_messages")
    sender_id: int = Field(foreign_key="user.id")
    sender: User | None = Relationship(back_populates="chat_messages")
    sender_type: ChatMessageSender = Field(default=ChatMessageSender.USER)
    content: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class StorySummary(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    conversation_id: int = Field(foreign_key="conversation.id")
    user_id: int = Field(foreign_key="user.id", nullable=False)
    conversation: Optional["Conversation"] = Relationship(
        back_populates="story_summary"
    )
    user: Optional["User"] = Relationship(back_populates="story_summaries")
    title: str | None = None
    summary_text: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    modified_at: datetime | None = Field(
        default_factory=datetime.utcnow, sa_column_kwargs={"onupdate": datetime.utcnow}
    )
    image_url: str | None = None


class StoryEmbedding(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("story_summary_id"),)

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    story_summary_id: int = Field(
        sa_column=Column(
            Integer,
            ForeignKey("storysummary.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
    )
    embedding: list[float] = Field(sa_type=Vector(1536))
    embedding_model: str = Field(default="text-embedding-3-small")
    content_hash: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    modified_at: datetime = Field(default_factory=datetime.utcnow)


class StoryRelationship(SQLModel, table=True):
    __table_args__ = (
        UniqueConstraint("user_id", "story_a_id", "story_b_id"),
        CheckConstraint(
            "story_a_id < story_b_id", name="story_relationship_ordered_ids"
        ),
    )

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    story_a_id: int = Field(
        sa_column=Column(
            Integer, ForeignKey("storysummary.id", ondelete="CASCADE"), nullable=False
        )
    )
    story_b_id: int = Field(
        sa_column=Column(
            Integer, ForeignKey("storysummary.id", ondelete="CASCADE"), nullable=False
        )
    )
    note: str | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Constellation(SQLModel, table=True):
    """A named, private group of the owner's saved memories."""

    id: int | None = Field(default=None, primary_key=True)
    owner_id: int = Field(
        sa_column=Column(
            Integer,
            ForeignKey("user.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
    )
    title: str
    overview: str = ""
    source_hash: str | None = None
    proposal_source_hash: str | None = None
    proposal_text: str | None = None
    proposal_at: datetime | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    modified_at: datetime = Field(default_factory=datetime.utcnow)


class ConstellationMemory(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("constellation_id", "story_id"),)
    id: int | None = Field(default=None, primary_key=True)
    constellation_id: int = Field(
        sa_column=Column(
            Integer,
            ForeignKey("constellation.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
    )
    story_id: int = Field(
        sa_column=Column(
            Integer,
            ForeignKey("storysummary.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
    )
    display_order: int = 0
    x: float | None = None
    y: float | None = None
    share_story: bool = False
    share_image: bool = False


class ConstellationLink(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("constellation_id", "relationship_id"),)
    id: int | None = Field(default=None, primary_key=True)
    constellation_id: int = Field(
        sa_column=Column(
            Integer,
            ForeignKey("constellation.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
    )
    relationship_id: int = Field(
        sa_column=Column(
            Integer,
            ForeignKey("storyrelationship.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
    )


class PublishedConstellation(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("constellation_id"),)
    id: int | None = Field(default=None, primary_key=True)
    constellation_id: int = Field(
        sa_column=Column(
            Integer,
            ForeignKey("constellation.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
    )
    owner_id: int = Field(
        sa_column=Column(
            Integer,
            ForeignKey("user.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
    )
    revision: int = 1
    title: str
    overview: str
    author_name: str
    author_level: int
    published_at: datetime = Field(default_factory=datetime.utcnow, index=True)


class PublishedMemory(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("publication_id", "source_story_id"),)
    id: int | None = Field(default=None, primary_key=True)
    publication_id: int = Field(
        sa_column=Column(
            Integer,
            ForeignKey("publishedconstellation.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
    )
    source_story_id: int  # Snapshot provenance; public reads never join a private story.
    display_order: int
    title: str
    story_text: str | None = None
    image_filename: str | None = None
    x: float | None = None
    y: float | None = None


class PublishedLink(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("publication_id", "story_a_id", "story_b_id"),)
    id: int | None = Field(default=None, primary_key=True)
    publication_id: int = Field(
        sa_column=Column(
            Integer,
            ForeignKey("publishedconstellation.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
    )
    story_a_id: int
    story_b_id: int


class ConstellationVote(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("publication_id", "user_id"),)
    id: int | None = Field(default=None, primary_key=True)
    publication_id: int = Field(
        sa_column=Column(
            Integer,
            ForeignKey("publishedconstellation.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
    )
    user_id: int = Field(
        sa_column=Column(
            Integer,
            ForeignKey("user.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
    )
    created_at: datetime = Field(default_factory=datetime.utcnow)


class ConstellationReport(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("publication_id", "user_id"),)
    id: int | None = Field(default=None, primary_key=True)
    publication_id: int = Field(
        sa_column=Column(
            Integer,
            ForeignKey("publishedconstellation.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
    )
    user_id: int = Field(
        sa_column=Column(
            Integer,
            ForeignKey("user.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
    )
    reason: str
    status: str = "open"
    created_at: datetime = Field(default_factory=datetime.utcnow)


class StoryRelationshipCreate(SQLModel):
    note: str | None = None


class StoryRelationshipPublic(SQLModel):
    id: int
    story_a_id: int
    story_b_id: int
    note: str | None
    created_at: datetime


class StorySummaryPublic(SQLModel):
    id: int
    conversation_id: int
    title: str | None = None
    summary_text: str
    image_url: str | None = None
    created_at: datetime
    modified_at: datetime | None


class StorySummaryCreate(SQLModel):
    conversation_id: int
    user_id: int
    summary_text: str
    title: str | None = None
    image_url: str | None = None


class StorySummaryUpdate(SQLModel):
    id: int
    title: str | None = None
    summary_text: str
    image_url: str | None = None
    modified_at: datetime | None


class RelatedStorySuggestion(SQLModel):
    story: StorySummaryPublic
    similarity: float
    reason: str


class ConversationCreate(SQLModel):
    user_story_prompt_id: int | None = None


class StoryStarterTopic(str, Enum):
    CHILDHOOD = "childhood"
    PEOPLE = "people"
    PLACES = "places"
    PROUD = "proud"


class ConversationStart(ConversationCreate):
    starter_topic: StoryStarterTopic | None = None


class ConversationPublic(ConversationCreate):
    id: int
    created_at: datetime
    status: ConversationStatus = Field(default=ConversationStatus.INACTIVE)
    parent_conversation_id: int | None = None
    node_title: str = "New memory"
    node_prompt: str | None = None
    branch_context: str | None = None
    node_depth: int = 0
    user_turn_count: int = 0
    ready_to_save: bool = False


class ChatMessageCreate(SQLModel):
    sender_type: ChatMessageSender
    content: str


class RealtimeSessionOffer(SQLModel):
    sdp: str = Field(min_length=1)


class ChatMessagePublic(ChatMessageCreate):
    id: int
    timestamp: datetime


class ConversationsPublic(SQLModel):
    data: list[ConversationPublic]
    count: int


class ChatMessagesPublic(SQLModel):
    data: list[ChatMessagePublic]
    count: int


# Generic message
class Message(SQLModel):
    message: str


# JSON payload containing access token
class Token(SQLModel):
    access_token: str
    token_type: str = "bearer"


# Contents of JWT token
class TokenPayload(SQLModel):
    sub: int | None = None


class NewPassword(SQLModel):
    token: str
    new_password: str


class ContactBase(SQLModel):
    email: str


class Contact(ContactBase, table=True):
    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", nullable=False)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    user: Optional["User"] = Relationship(back_populates="contacts")


class ContactCreate(ContactBase):
    pass


class ContactRead(ContactBase):
    id: int
    created_at: datetime


class ContactUpdate(SQLModel):
    email: str | None = None


class MemoryXP(SQLModel, table=True):
    """An immutable reward per conversation, including after a story is deleted."""

    __table_args__ = (UniqueConstraint("user_id", "conversation_key"),)
    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(
        sa_column=Column(
            Integer,
            ForeignKey("user.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
    )
    conversation_key: int
    points: int = 25
    earned_at: datetime = Field(default_factory=datetime.utcnow)


class MemoryDay(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("user_id", "activity_date"),)
    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(
        sa_column=Column(
            Integer,
            ForeignKey("user.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
    )
    activity_date: date
