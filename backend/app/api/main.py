from fastapi import APIRouter

from app.api.routes import (
    categories,
    chat_messages,
    constellations,
    contacts,
    conversations,
    images,
    items,
    login,
    membership,
    narration,
    progress,
    public_sky,
    realtime,
    story_summaries,
    user_story_prompts,
    users,
    utils,
)

api_router = APIRouter()
api_router.include_router(login.router, tags=["login"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(membership.router, prefix="/membership", tags=["membership"])
api_router.include_router(utils.router, prefix="/utils", tags=["utils"])
api_router.include_router(items.router, prefix="/items", tags=["items"])
api_router.include_router(
    conversations.router, prefix="/conversations", tags=["conversations"]
)
api_router.include_router(
    chat_messages.router, prefix="/chat_messages", tags=["chat_messages"]
)
api_router.include_router(realtime.router, prefix="/realtime", tags=["realtime"])
api_router.include_router(
    user_story_prompts.router, prefix="/user_story_prompts", tags=["user_story_prompts"]
)
api_router.include_router(
    story_summaries.router, prefix="/summaries", tags=["summaries"]
)
api_router.include_router(categories.router, prefix="/categories", tags=["categories"])
api_router.include_router(images.router, prefix="/images", tags=["images"])
api_router.include_router(contacts.router, prefix="/contacts", tags=["contacts"])

api_router.include_router(progress.router, prefix="/progress", tags=["progress"])
api_router.include_router(
    constellations.router, prefix="/constellations", tags=["constellations"]
)
api_router.include_router(public_sky.router, prefix="/night-sky", tags=["night-sky"])
api_router.include_router(narration.router, prefix="/narration", tags=["narration"])
