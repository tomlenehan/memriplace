import asyncio
from types import SimpleNamespace

from fastapi import BackgroundTasks

from app.api.routes.chat_messages import create_chat_message
from app.api.routes.conversations import activate_story_node
from app.llm.conversation_intents import (
    STORY_EXPLICIT_PAUSE_MESSAGE,
    STORY_PAUSE_MESSAGE,
    STORY_RESUME_QUESTION,
    is_explicit_pause_request,
)
from app.llm.conversation_lifecycle import (
    choose_post_reply_action,
    run_post_reply_workflow,
)
from app.llm.evaluations import LIFECYCLE_EVALUATION_CASES, evaluate_lifecycle_case
from app.llm.utils import MAX_NODE_USER_TURNS, MIN_READY_USER_TURNS
from app.models import (
    ChatMessage,
    ChatMessageCreate,
    ChatMessageSender,
    Conversation,
    ConversationStatus,
    StorySummary,
)


def test_lifecycle_evaluation_cases_match_the_workflow_contract() -> None:
    for case in LIFECYCLE_EVALUATION_CASES:
        assert (
            evaluate_lifecycle_case(case["inputs"])["action"]
            == case["outputs"]["expected_action"]
        )


def test_finished_story_skips_readiness_workflow() -> None:
    assert (
        choose_post_reply_action(
            status=ConversationStatus.COMPLETE,
            user_turn_count=3,
            ready_to_save=True,
            expected_turn_count=3,
        )
        == "wait"
    )


def test_readiness_starts_only_after_the_minimum_number_of_replies() -> None:
    assert MIN_READY_USER_TURNS == 6
    for turns, expected in ((5, "wait"), (6, "readiness")):
        assert (
            choose_post_reply_action(
                status=ConversationStatus.ACTIVE,
                user_turn_count=turns,
                ready_to_save=False,
                expected_turn_count=turns,
            )
            == expected
        )


def test_pause_request_is_detected_without_mistaking_uncertain_answers_for_pauses() -> (
    None
):
    assert is_explicit_pause_request("I don't know. Can we stop for now?")
    assert is_explicit_pause_request("Let's pause here.")
    assert is_explicit_pause_request("I think we should take a break")
    assert not is_explicit_pause_request("I don't know what happened next.")
    assert not is_explicit_pause_request("I stopped by the old house yesterday.")


def test_explicit_pause_saves_the_reply_and_skips_the_readiness_threshold(
    monkeypatch,
) -> None:
    conversation = Conversation(
        id=42,
        user_id=7,
        status=ConversationStatus.ACTIVE,
        user_turn_count=0,
    )

    class FakeSession:
        def __init__(self) -> None:
            self.added: list[object] = []

        def get(self, model, _id):
            return conversation if model is Conversation else None

        def add(self, item) -> None:
            self.added.append(item)

        def commit(self) -> None:
            pass

        def refresh(self, _item) -> None:
            pass

    monkeypatch.setattr(
        "app.api.routes.chat_messages.refresh_story_status", lambda *_args: None
    )
    session = FakeSession()
    response = asyncio.run(
        create_chat_message(
            conversation_id=42,
            chat_message_in=ChatMessageCreate(
                sender_type=ChatMessageSender.USER,
                content="I don't know. Can we stop for now?",
            ),
            background_tasks=BackgroundTasks(),
            current_user=SimpleNamespace(id=7),
            db_session=session,
        )
    )

    async def read_response() -> str:
        return "".join([chunk async for chunk in response.body_iterator])

    assert asyncio.run(read_response()) == STORY_EXPLICIT_PAUSE_MESSAGE
    assert conversation.user_turn_count == 1
    assert conversation.status == ConversationStatus.READY_FOR_SUMMARY
    assert conversation.ready_to_save is True
    assert [
        item.content for item in session.added if isinstance(item, ChatMessage)
    ] == [
        "I don't know. Can we stop for now?",
        STORY_EXPLICIT_PAUSE_MESSAGE,
    ]


def test_resuming_ready_active_story_adds_one_question_after_pause_message() -> None:
    conversation = Conversation(
        id=42,
        user_id=7,
        status=ConversationStatus.ACTIVE,
        ready_to_save=False,
        user_turn_count=6,
    )
    latest_message = ChatMessage(
        id=2,
        conversation_id=42,
        sender_id=7,
        sender_type=ChatMessageSender.AI,
        content=STORY_PAUSE_MESSAGE,
    )

    class FakeSession:
        def __init__(self) -> None:
            self.added: list[object] = []
            self.latest_message = latest_message

        def get(self, model, _id):
            return conversation if model is Conversation else None

        def exec(self, statement):
            entity = statement.column_descriptions[0]["entity"]
            if entity is Conversation:
                result = conversation
            elif entity is ChatMessage:
                result = self.latest_message
            else:
                result = None
            return SimpleNamespace(first=lambda: result)

        def add(self, item) -> None:
            self.added.append(item)
            if isinstance(item, ChatMessage):
                self.latest_message = item

        def commit(self) -> None:
            pass

        def refresh(self, _item) -> None:
            pass

    session = FakeSession()
    user = SimpleNamespace(id=7)

    activate_story_node(id=42, session=session, current_user=user)
    activate_story_node(id=42, session=session, current_user=user)

    resume_messages = [
        item
        for item in session.added
        if isinstance(item, ChatMessage) and item.content == STORY_RESUME_QUESTION
    ]
    assert len(resume_messages) == 1
    assert conversation.ready_to_save is False


def test_resuming_paused_ready_story_is_idempotent_and_keeps_save_eligibility() -> None:
    conversation = Conversation(
        id=42,
        user_id=7,
        status=ConversationStatus.READY_FOR_SUMMARY,
        ready_to_save=True,
        user_turn_count=1,
    )
    latest_message = ChatMessage(
        id=2,
        conversation_id=42,
        sender_id=7,
        sender_type=ChatMessageSender.AI,
        content=STORY_EXPLICIT_PAUSE_MESSAGE,
    )

    class FakeSession:
        def __init__(self) -> None:
            self.added: list[object] = []
            self.latest_message = latest_message

        def exec(self, statement):
            entity = statement.column_descriptions[0]["entity"]
            if entity is Conversation:
                result = conversation
            elif entity is ChatMessage:
                result = self.latest_message
            elif entity is StorySummary:
                result = None
            else:
                result = None
            return SimpleNamespace(first=lambda: result)

        def add(self, item) -> None:
            self.added.append(item)
            if isinstance(item, ChatMessage):
                self.latest_message = item

        def commit(self) -> None:
            pass

        def refresh(self, _item) -> None:
            pass

    session = FakeSession()
    user = SimpleNamespace(id=7)

    activate_story_node(id=42, session=session, current_user=user)
    activate_story_node(id=42, session=session, current_user=user)

    resume_messages = [
        item
        for item in session.added
        if isinstance(item, ChatMessage) and item.content == STORY_RESUME_QUESTION
    ]
    assert len(resume_messages) == 1
    assert conversation.status == ConversationStatus.ACTIVE
    assert conversation.ready_to_save is True


def test_ready_story_at_turn_limit_cannot_be_resumed() -> None:
    conversation = Conversation(
        id=42,
        user_id=7,
        status=ConversationStatus.READY_FOR_SUMMARY,
        ready_to_save=True,
        user_turn_count=MAX_NODE_USER_TURNS,
    )

    class FakeSession:
        def __init__(self) -> None:
            self.added: list[object] = []

        def exec(self, statement):
            entity = statement.column_descriptions[0]["entity"]
            return SimpleNamespace(first=lambda: conversation if entity is Conversation else None)

        def add(self, item) -> None:
            self.added.append(item)

        def commit(self) -> None:
            pass

        def refresh(self, _item) -> None:
            pass

    session = FakeSession()

    activate_story_node(id=42, session=session, current_user=SimpleNamespace(id=7))

    assert conversation.status == ConversationStatus.READY_FOR_SUMMARY
    assert not any(
        isinstance(item, ChatMessage) and item.content == STORY_RESUME_QUESTION
        for item in session.added
    )


def test_post_reply_workflow_uses_a_named_parent_trace(monkeypatch) -> None:
    received: dict[str, object] = {}

    class FakeWorkflow:
        async def ainvoke(self, state, config):
            received["state"] = state
            received["config"] = config

    monkeypatch.setattr(
        "app.llm.conversation_lifecycle.post_reply_workflow", FakeWorkflow()
    )

    asyncio.run(run_post_reply_workflow(42, 3))

    assert received["state"] == {"conversation_id": 42, "expected_turn_count": 3}
    assert received["config"]["run_name"] == "memriplace.conversation.lifecycle"
