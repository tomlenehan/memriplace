from sqlalchemy import or_
from sqlmodel import Session, col, select

from app.models import PublishedConstellation, PublishedMemory, UserMembership

FREE_PUBLIC_MEMORY_LIMIT = 1


def active_membership(session: Session, user_id: int) -> UserMembership | None:
    membership = session.exec(
        select(UserMembership).where(UserMembership.user_id == user_id)
    ).first()
    if (
        membership
        and membership.plan_code == "plus"
        and membership.status in {"active", "trialing"}
    ):
        return membership
    return None


def shared_memory_ids(
    session: Session,
    user_id: int,
    excluding_constellation_id: int | None = None,
) -> set[int]:
    statement = (
        select(PublishedMemory.source_story_id)
        .join(
            PublishedConstellation,
            col(PublishedConstellation.id) == col(PublishedMemory.publication_id),
        )
        .where(
            col(PublishedConstellation.owner_id) == user_id,
            or_(
                col(PublishedMemory.story_text).is_not(None),
                col(PublishedMemory.image_filename).is_not(None),
            ),
        )
    )
    if excluding_constellation_id is not None:
        statement = statement.where(
            col(PublishedConstellation.constellation_id) != excluding_constellation_id
        )
    return set(session.exec(statement).all())
