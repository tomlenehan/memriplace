from datetime import datetime
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.api.deps import CurrentUser, SessionDep
from app.api.routes.constellations import _owned
from app.core.config import settings
from app.services.memberships import (
    FREE_PUBLIC_MEMORY_LIMIT,
    active_membership,
    shared_memory_ids,
)

router = APIRouter()


class MembershipStatus(BaseModel):
    enabled: bool
    plan: Literal["free", "plus"]
    status: str
    is_paid: bool
    public_memory_limit: int | None
    shared_memory_count: int
    shared_memory_ids: list[int]
    current_period_end: datetime | None = None
    cancel_at_period_end: bool = False


@router.get("/me", response_model=MembershipStatus)
def read_membership(
    session: SessionDep,
    current_user: CurrentUser,
    excluding_constellation_id: int | None = None,
) -> MembershipStatus:
    user_id = current_user.id
    if user_id is None:
        raise HTTPException(status_code=401, detail="Sign in to view your membership")

    if excluding_constellation_id is not None:
        _owned(session, user_id, excluding_constellation_id)

    membership = active_membership(session, user_id)
    ids = shared_memory_ids(
        session, user_id, excluding_constellation_id=excluding_constellation_id
    )
    return MembershipStatus(
        enabled=settings.MEMBERSHIPS_ENABLED,
        plan="plus" if membership else "free",
        status=membership.status if membership else "free",
        is_paid=membership is not None,
        public_memory_limit=(
            FREE_PUBLIC_MEMORY_LIMIT
            if settings.MEMBERSHIPS_ENABLED and membership is None
            else None
        ),
        shared_memory_count=len(ids),
        shared_memory_ids=sorted(ids),
        current_period_end=membership.current_period_end if membership else None,
        cancel_at_period_end=membership.cancel_at_period_end if membership else False,
    )
