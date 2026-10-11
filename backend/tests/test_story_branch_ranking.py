import asyncio

from app.core.config import settings
from app.llm import story_nodes


def branches():
    return [
        story_nodes.StoryBranch(
            title="The blue toolbox",
            connection="You mentioned the toolbox your father kept by the workbench.",
            prompt="What do you remember about opening that toolbox together?",
        ),
        story_nodes.StoryBranch(
            title="Saturday mornings",
            connection="You mentioned spending time with your father.",
            prompt="What else comes to mind when you think about those mornings?",
        ),
    ]


def test_rank_story_branches_uses_grounded_choice_and_probabilities(monkeypatch):
    monkeypatch.setattr(settings, "TYPESAFE_API_KEY", "test-key")
    requests = []

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {
                "answers": {
                    "follow_up": {
                        "type": "choice",
                        "choice": "idea_2",
                        "confidence": 0.91,
                        "probabilities": {"idea_1": 0.09, "idea_2": 0.91},
                    }
                }
            }

    class FakeClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_):
            return None

        async def post(self, url, headers, json):
            requests.append((url, headers, json))
            return FakeResponse()

    monkeypatch.setattr(story_nodes.httpx, "AsyncClient", lambda **_: FakeClient())
    candidates = branches()

    ranked = asyncio.run(
        story_nodes.rank_story_branches(
            "He kept his blue toolbox beside the workbench.", candidates
        )
    )

    assert [branch.title for branch in ranked] == [
        "Saturday mornings",
        "The blue toolbox",
    ]
    url, headers, payload = requests[0]
    assert url == story_nodes.TYPESAFE_API_URL
    assert headers == {"Authorization": "Bearer test-key"}
    assert payload["state"]["storyteller_details"].startswith(
        "He kept his blue toolbox"
    )
    assert "The blue toolbox" in payload["questions"]["follow_up"]["criteria"]["idea_1"]


def test_rank_story_branches_skips_api_without_key(monkeypatch):
    monkeypatch.setattr(settings, "TYPESAFE_API_KEY", None)

    def unexpected_client(**_):
        raise AssertionError("Jev should not be called without a key")

    monkeypatch.setattr(story_nodes.httpx, "AsyncClient", unexpected_client)
    candidates = branches()

    assert (
        asyncio.run(story_nodes.rank_story_branches("A story", candidates))
        == candidates
    )


def test_rank_story_branches_keeps_original_order_when_confidence_is_low(monkeypatch):
    monkeypatch.setattr(settings, "TYPESAFE_API_KEY", "test-key")

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {
                "answers": {
                    "follow_up": {
                        "type": "choice",
                        "choice": "idea_2",
                        "confidence": 0.4,
                        "probabilities": {"idea_1": 0.2, "idea_2": 0.8},
                    }
                }
            }

    class FakeClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_):
            return None

        async def post(self, *_args, **_kwargs):
            return FakeResponse()

    monkeypatch.setattr(story_nodes.httpx, "AsyncClient", lambda **_: FakeClient())
    candidates = branches()

    assert (
        asyncio.run(story_nodes.rank_story_branches("A story", candidates))
        == candidates
    )


def test_rank_story_branches_keeps_original_order_when_api_fails(monkeypatch):
    monkeypatch.setattr(settings, "TYPESAFE_API_KEY", "test-key")

    class FakeClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_):
            return None

        async def post(self, *_args, **_kwargs):
            raise TimeoutError("request timed out")

    monkeypatch.setattr(story_nodes.httpx, "AsyncClient", lambda **_: FakeClient())
    candidates = branches()

    assert (
        asyncio.run(story_nodes.rank_story_branches("A story", candidates))
        == candidates
    )
