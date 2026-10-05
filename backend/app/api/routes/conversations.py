import logging
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlmodel import Session, func, select

from app.api.deps import get_current_user, get_db
from app.llm.conversation_intents import STORY_PAUSE_MESSAGE, STORY_RESUME_QUESTION
from app.llm.conversation_lifecycle import run_post_reply_workflow
from app.llm.story_nodes import create_story_branches
from app.llm.utils import MAX_NODE_USER_TURNS
from app.models import (
    ChatMessage,
    ChatMessageSender,
    Conversation,
    ConversationCreate,
    ConversationPublic,
    ConversationsPublic,
    ConversationStart,
    ConversationStatus,
    Message,
    StoryStarterTopic,
    StorySummary,
    User,
    UserStoryPrompt,
)

logger = logging.getLogger(__name__)

router = APIRouter()

ROOT_NODE_TITLE = "Childhood beginnings"
ROOT_NODE_PROMPT = (
    "Tell me about your childhood. What's one early moment you still remember?"
)
STORY_STARTERS = {
    StoryStarterTopic.CHILDHOOD: (
        "A memory from growing up",
        "What's one moment from growing up that you still remember clearly?",
    ),
    StoryStarterTopic.PEOPLE: (
        "Someone special",
        "Tell me about someone who made a difference in your life. What do you remember about them?",
    ),
    StoryStarterTopic.PLACES: (
        "A favorite place",
        "Is there a place that still feels special to you? What happened there?",
    ),
    StoryStarterTopic.PROUD: (
        "A moment you felt proud",
        "Tell me about a moment when you felt proud. What made it meaningful?",
    ),
}


@router.post("/", response_model=ConversationPublic)
def create_conversation(
    *,
    session: Session = Depends(get_db),
    conversation_in: ConversationStart,
    current_user: User = Depends(get_current_user),
) -> Any:
    if (
        conversation_in.user_story_prompt_id is not None
        and conversation_in.starter_topic is not None
    ):
        raise HTTPException(status_code=400, detail="Choose one story starter")
    user_story_prompt = None
    if conversation_in.user_story_prompt_id is not None:
        user_story_prompt = session.get(
            UserStoryPrompt, conversation_in.user_story_prompt_id
        )
        if not user_story_prompt:
            raise HTTPException(status_code=404, detail="User story prompt not found")
        if (
            user_story_prompt.user_id != current_user.id
            and not current_user.is_superuser
        ):
            raise HTTPException(status_code=403, detail="Not enough permissions")

    if user_story_prompt:
        node_prompt = user_story_prompt.prompt
        node_title = user_story_prompt.prompt[:72]
    elif conversation_in.starter_topic:
        node_title, node_prompt = STORY_STARTERS[conversation_in.starter_topic]
    else:
        node_title, node_prompt = ROOT_NODE_TITLE, ROOT_NODE_PROMPT
    conversation = Conversation(
        user_id=current_user.id,
        user_story_prompt_id=user_story_prompt.id if user_story_prompt else None,
        node_title=node_title,
        node_prompt=node_prompt,
        node_depth=0,
        user_turn_count=0,
        status=ConversationStatus.ACTIVE,
    )
    session.add(conversation)
    session.flush()
    initial_message = ChatMessage(
        conversation_id=conversation.id,
        sender_id=current_user.id,
        sender_type=ChatMessageSender.AI,
        content=node_prompt,
    )
    session.add(initial_message)
    session.commit()
    session.refresh(conversation)

    return conversation


@router.get("/", response_model=ConversationsPublic)
def read_conversations(
    sessions: Session = Depends(get_db),
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(get_current_user),
) -> ConversationsPublic:
    conversations = sessions.exec(
        select(Conversation)
        .where(Conversation.user_id == current_user.id)
        .order_by(Conversation.created_at.asc(), Conversation.id.asc())
        .offset(skip)
        .limit(limit)
    ).all()
    count_statement = (
        select(func.count())
        .select_from(Conversation)
        .where(Conversation.user_id == current_user.id)
    )
    count = sessions.exec(count_statement).one()
    return ConversationsPublic(data=conversations, count=count)


@router.get("/{id}", response_model=ConversationPublic)
def read_conversation(
    id: int,
    sessions: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Conversation:
    conversation = sessions.get(Conversation, id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if conversation.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    return conversation


@router.put("/{id}", response_model=ConversationPublic)
def update_conversation(
    *,
    id: int,
    conversation_in: ConversationCreate,
    sessions: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Conversation:
    conversation = sessions.get(Conversation, id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if conversation.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    if conversation_in.user_story_prompt_id is not None:
        prompt = sessions.get(UserStoryPrompt, conversation_in.user_story_prompt_id)
        if not prompt:
            raise HTTPException(status_code=404, detail="User story prompt not found")
        if prompt.user_id != current_user.id and not current_user.is_superuser:
            raise HTTPException(status_code=403, detail="Not enough permissions")
        conversation.user_story_prompt_id = prompt.id
        conversation.node_prompt = prompt.prompt
        conversation.node_title = prompt.prompt[:72]

    sessions.add(conversation)
    sessions.commit()
    sessions.refresh(conversation)
    return conversation


@router.delete("/{id}")
def delete_conversation(
    id: int,
    sessions: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Message:
    conversation = sessions.get(Conversation, id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if conversation.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    sessions.delete(conversation)
    sessions.commit()
    return Message(message="Conversation deleted successfully")


@router.post("/{id}/activate", response_model=ConversationPublic)
def activate_story_node(
    *,
    id: int,
    session: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Conversation:
    # Serialize concurrent Continue requests so a paused node only gets one
    # resume prompt and its state transition is applied once.
    conversation = session.exec(
        select(Conversation).where(Conversation.id == id).with_for_update()
    ).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Story node not found")
    if conversation.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    if conversation.status == ConversationStatus.READY_FOR_SUMMARY:
        saved_summary = session.exec(
            select(StorySummary.id)
            .where(StorySummary.conversation_id == conversation.id)
            .limit(1)
        ).first()
        if saved_summary or conversation.user_turn_count >= MAX_NODE_USER_TURNS:
            return conversation
        # A ready-to-save path is still resumable until it reaches the turn cap
        # or a memory has actually been saved. Keep its save eligibility while
        # the storyteller continues, so they can save without another turn.
        conversation.status = ConversationStatus.ACTIVE
        conversation.ready_to_save = True
        session.add(conversation)
        session.add(
            ChatMessage(
                conversation_id=conversation.id,
                sender_id=current_user.id,
                sender_type=ChatMessageSender.AI,
                content=STORY_RESUME_QUESTION,
            )
        )
        session.commit()
        session.refresh(conversation)
        return conversation
    if (
        conversation.status == ConversationStatus.ACTIVE
        and conversation.user_turn_count < MAX_NODE_USER_TURNS
    ):
        latest_message = session.exec(
            select(ChatMessage)
            .where(ChatMessage.conversation_id == conversation.id)
            .order_by(ChatMessage.id.desc())
            .limit(1)
        ).first()
        if (
            latest_message is not None
            and latest_message.sender_type == ChatMessageSender.AI
            and latest_message.content.strip() == STORY_PAUSE_MESSAGE
        ):
            conversation.ready_to_save = False
            session.add(conversation)
            session.add(
                ChatMessage(
                    conversation_id=conversation.id,
                    sender_id=current_user.id,
                    sender_type=ChatMessageSender.AI,
                    content=STORY_RESUME_QUESTION,
                )
            )
            session.commit()
            session.refresh(conversation)
        return conversation
    if conversation.status != ConversationStatus.INACTIVE:
        return conversation

    if conversation.parent_conversation_id is None:
        if conversation.node_depth > 0:
            raise HTTPException(
                status_code=409, detail="This story path is not unlocked yet"
            )
    else:
        parent = session.get(Conversation, conversation.parent_conversation_id)
        if not parent or parent.user_id != current_user.id:
            raise HTTPException(
                status_code=409, detail="This story path is not unlocked yet"
            )
        parent_finished = (
            parent.status
            in {
                ConversationStatus.READY_FOR_SUMMARY,
                ConversationStatus.COMPLETE,
            }
            or parent.user_turn_count >= MAX_NODE_USER_TURNS
        )
        if not parent_finished:
            raise HTTPException(status_code=409, detail="Finish the parent story first")
        if (
            parent.user_turn_count >= MAX_NODE_USER_TURNS
            and parent.status == ConversationStatus.ACTIVE
        ):
            parent.status = ConversationStatus.READY_FOR_SUMMARY
            session.add(parent)

    existing_message_id = session.exec(
        select(ChatMessage.id).where(ChatMessage.conversation_id == conversation.id)
    ).first()
    conversation.status = ConversationStatus.ACTIVE
    if existing_message_id is None:
        session.add(
            ChatMessage(
                conversation_id=conversation.id,
                sender_id=current_user.id,
                sender_type=ChatMessageSender.AI,
                content=conversation.node_prompt or ROOT_NODE_PROMPT,
            )
        )
    session.add(conversation)
    session.commit()
    session.refresh(conversation)
    return conversation


@router.post("/{id}/branches", response_model=list[ConversationPublic])
async def retry_story_branches(
    *,
    id: int,
    session: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[Conversation]:
    conversation = session.get(Conversation, id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Story node not found")
    if conversation.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    if conversation.user_turn_count < 1:
        raise HTTPException(
            status_code=409, detail="Share a memory before opening new paths"
        )
    if conversation.status not in {
        ConversationStatus.READY_FOR_SUMMARY,
        ConversationStatus.COMPLETE,
    }:
        raise HTTPException(status_code=409, detail="Finish this story node first")

    try:
        return await create_story_branches(conversation, session)
    except Exception as error:
        logger.exception("Unable to generate story branches for node %s", id)
        session.rollback()
        raise HTTPException(
            status_code=502,
            detail="We couldn't find the next story paths. Please try again.",
        ) from error


@router.post("/{id}/wrap-up", response_model=ConversationPublic)
def wrap_up_story_node(
    *,
    id: int,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Conversation:
    conversation = session.get(Conversation, id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Story node not found")
    if conversation.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    if conversation.status == ConversationStatus.READY_FOR_SUMMARY:
        return conversation
    if conversation.status != ConversationStatus.ACTIVE:
        raise HTTPException(
            status_code=409, detail="This story path cannot be wrapped up"
        )
    if conversation.user_turn_count < 1:
        raise HTTPException(
            status_code=409, detail="Share a memory before saving this story."
        )
    conversation.status = ConversationStatus.READY_FOR_SUMMARY
    conversation.ready_to_save = True
    session.add(conversation)
    session.add(
        ChatMessage(
            conversation_id=id,
            sender_id=current_user.id,
            sender_type=ChatMessageSender.AI,
            content=STORY_PAUSE_MESSAGE,
        )
    )
    session.commit()
    session.refresh(conversation)
    background_tasks.add_task(
        run_post_reply_workflow,
        id,
        conversation.user_turn_count,
    )
    return conversation
