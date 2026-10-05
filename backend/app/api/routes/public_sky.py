"""Reviewed, immutable public projections of private constellations."""
import hashlib
import json
import shutil
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from pydantic import Field as PydanticField
from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert
from sqlmodel import select

from app.api.deps import CurrentUser, SessionDep, get_current_active_superuser
from app.api.routes.constellations import _members, _owned
from app.core.config import settings
from app.models import (
    ConstellationLink,
    ConstellationReport,
    ConstellationVote,
    MemoryXP,
    PublishedConstellation,
    PublishedLink,
    PublishedMemory,
    StoryRelationship,
    StorySummary,
    User,
)
from app.services.memberships import (
    FREE_PUBLIC_MEMORY_LIMIT,
    active_membership,
    shared_memory_ids,
)
from app.utils import get_local_uploads_directory, get_private_image_url

router = APIRouter()


class PublishRequest(BaseModel):
    author_name: str = PydanticField(min_length=2, max_length=60)
    preview_token: str = PydanticField(min_length=64, max_length=64)


class PreviewRequest(BaseModel):
    author_name: str = PydanticField(min_length=2, max_length=60)


class SkyLink(BaseModel):
    a: int
    b: int


class SkyStar(BaseModel):
    index: int
    title: str
    story_text: str | None = None
    image_url: str | None = None
    x: float | None = None
    y: float | None = None


class PublicConstellation(BaseModel):
    id: int | None = None
    title: str
    overview: str
    author_name: str
    author_level: int
    votes: int = 0
    revision: int = 1
    published_at: datetime | None = None
    stars: list[SkyStar]
    links: list[SkyLink]
    preview_token: str | None = None


class SkyPoint(BaseModel):
    x: float
    y: float


class SkyCluster(BaseModel):
    id: int
    title: str
    overview_excerpt: str
    author_name: str
    author_level: int
    star_count: int
    votes: int
    published_at: datetime
    preview_stars: list[SkyPoint] = PydanticField(default_factory=list)
    preview_links: list[SkyLink] = PydanticField(default_factory=list)


class SkyPage(BaseModel):
    data: list[SkyCluster]
    count: int


class VoteResult(BaseModel):
    votes: int
    voted: bool


class ReportRequest(BaseModel):
    reason: str = PydanticField(min_length=10, max_length=500)


class ReportAdmin(BaseModel):
    id: int
    publication_id: int
    user_id: int
    reason: str
    status: str
    created_at: datetime


def _enabled() -> None:
    if not settings.PUBLIC_SKY_ENABLED:
        raise HTTPException(503, "The Global Night Sky is not open yet")


def _author_name(name: str, email: str) -> str:
    value = name.strip()
    if len(value) < 2 or "@" in value or value.casefold() == email.casefold():
        raise HTTPException(
            422, "Choose a display name or pseudonym, not an email address"
        )
    return value


def _level(session: SessionDep, user_id: int) -> int:
    total = session.exec(
        select(func.coalesce(func.sum(MemoryXP.points), 0)).where(
            MemoryXP.user_id == user_id,
        )
    ).one()
    return int(total) // 100 + 1


def _draft_snapshot(
    session: SessionDep, constellation_id: int, user_id: int, author_name: str
) -> tuple[PublicConstellation, list[tuple[SkyStar, str | None]]]:
    record = _owned(session, user_id, constellation_id)
    members = _members(session, record.id)
    if len(members) < 2 or not record.title.strip() or not record.overview.strip():
        raise HTTPException(
            422,
            "Name and describe a constellation of at least two memories before publishing",
        )
    if settings.MEMBERSHIPS_ENABLED and not active_membership(session, user_id):
        already_shared = shared_memory_ids(
            session, user_id, excluding_constellation_id=record.id
        )
        requested_shared = {
            member.story_id
            for member in members
            if member.share_story or member.share_image
        }
        if len(already_shared | requested_shared) > FREE_PUBLIC_MEMORY_LIMIT:
            raise HTTPException(
                402,
                "The Free plan includes story or photo details for one memory. "
                "Choose at most one memory, or visit Membership to share more.",
            )
    stories = {
        s.id: s
        for s in session.exec(
            select(StorySummary).where(
                StorySummary.user_id == user_id,
                StorySummary.id.in_([m.story_id for m in members]),
            )
        ).all()
    }
    if len(stories) != len(members):
        raise HTTPException(422, "This constellation contains a missing memory")
    position = {m.story_id: i for i, m in enumerate(members)}
    links = session.exec(
        select(StoryRelationship)
        .join(
            ConstellationLink, ConstellationLink.relationship_id == StoryRelationship.id
        )
        .where(
            ConstellationLink.constellation_id == record.id,
            StoryRelationship.user_id == user_id,
        )
    ).all()
    result_links = [
        SkyLink(a=position[r.story_a_id], b=position[r.story_b_id])
        for r in links
        if r.story_a_id in position and r.story_b_id in position
    ]
    if not result_links:
        raise HTTPException(422, "Connect the memories before publishing")
    prepared = []
    for i, member in enumerate(members):
        story = stories[member.story_id]
        source_image = story.image_url if member.share_image else None
        if source_image and not source_image.startswith("disk-private://"):
            raise HTTPException(
                422,
                "One selected image cannot be published. Turn off image sharing for that memory.",
            )
        if source_image:
            source_name = source_image.removeprefix("disk-private://")
            source = get_local_uploads_directory() / source_name
            if (
                Path(source_name).name != source_name
                or not source.is_file()
                or source.suffix.lower()
                not in {".png", ".jpg", ".jpeg", ".webp", ".gif"}
                or source.stat().st_size > 10 * 1024 * 1024
            ):
                raise HTTPException(
                    422, "One selected image is unavailable or exceeds 10 MB"
                )
        prepared.append(
            (
                SkyStar(
                    index=i,
                    title=(story.title or "A remembered moment")[:160],
                    story_text=story.summary_text[:12000]
                    if member.share_story
                    else None,
                    image_url=get_private_image_url(source_image, user_id=user_id)
                    if source_image
                    else None,
                    x=member.x,
                    y=member.y,
                ),
                source_image,
            )
        )
    author_level = _level(session, user_id)
    signature = {
        "owner": user_id,
        "constellation": record.id,
        "title": record.title,
        "overview": record.overview,
        "author": author_name,
        "author_level": author_level,
        "stars": [
            (star.model_dump(exclude={"image_url"}), source_image)
            for star, source_image in prepared
        ],
        "links": [link.model_dump() for link in result_links],
    }
    token = hashlib.sha256(
        json.dumps(signature, sort_keys=True, ensure_ascii=False).encode()
    ).hexdigest()
    publication = session.exec(
        select(PublishedConstellation).where(
            PublishedConstellation.constellation_id == record.id,
        )
    ).first()
    return PublicConstellation(
        id=publication.id if publication else None,
        title=record.title,
        overview=record.overview,
        author_name=author_name,
        author_level=author_level,
        revision=(publication.revision + 1) if publication else 1,
        stars=[star for star, _ in prepared],
        links=result_links,
        preview_token=token,
    ), prepared


def _media_directory() -> Path:
    return get_local_uploads_directory() / "public_sky"


def _delete_media(filenames: list[str]) -> None:
    for name in filenames:
        if Path(name).name == name:
            (_media_directory() / name).unlink(missing_ok=True)


def _published_detail(
    session: SessionDep, publication: PublishedConstellation
) -> PublicConstellation:
    stars = session.exec(
        select(PublishedMemory)
        .where(
            PublishedMemory.publication_id == publication.id,
        )
        .order_by(PublishedMemory.display_order)
    ).all()
    links = session.exec(
        select(PublishedLink).where(
            PublishedLink.publication_id == publication.id,
        )
    ).all()
    positions = {star.source_story_id: i for i, star in enumerate(stars)}
    votes = session.exec(
        select(func.count(ConstellationVote.id)).where(
            ConstellationVote.publication_id == publication.id,
        )
    ).one()
    return PublicConstellation(
        id=publication.id,
        title=publication.title,
        overview=publication.overview,
        author_name=publication.author_name,
        author_level=publication.author_level,
        revision=publication.revision,
        votes=votes,
        published_at=publication.published_at,
        stars=[
            SkyStar(
                index=i,
                title=star.title,
                story_text=star.story_text,
                image_url=f"{settings.API_V1_STR}/night-sky/media/{publication.id}/{star.image_filename}"
                if star.image_filename
                else None,
                x=star.x,
                y=star.y,
            )
            for i, star in enumerate(stars)
        ],
        links=[
            SkyLink(a=positions[link.story_a_id], b=positions[link.story_b_id])
            for link in links
            if link.story_a_id in positions and link.story_b_id in positions
        ],
    )


@router.post("/preview/{constellation_id}", response_model=PublicConstellation)
def preview_publication(
    constellation_id: int,
    body: PreviewRequest,
    session: SessionDep,
    current_user: CurrentUser,
) -> PublicConstellation:
    name = _author_name(body.author_name, current_user.email)
    preview, _ = _draft_snapshot(session, constellation_id, current_user.id, name)
    return preview


@router.post("/publish/{constellation_id}", response_model=PublicConstellation)
def publish_constellation(
    constellation_id: int,
    body: PublishRequest,
    session: SessionDep,
    current_user: CurrentUser,
) -> PublicConstellation:
    _enabled()
    name = _author_name(body.author_name, current_user.email)
    if settings.MEMBERSHIPS_ENABLED and not active_membership(session, current_user.id):
        session.exec(
            select(User).where(User.id == current_user.id).with_for_update()
        ).first()
    preview, prepared = _draft_snapshot(
        session, constellation_id, current_user.id, name
    )
    if preview.preview_token != body.preview_token:
        raise HTTPException(
            409, "This constellation changed. Review the public preview again."
        )
    existing = session.exec(
        select(PublishedConstellation).where(
            PublishedConstellation.constellation_id == constellation_id,
            PublishedConstellation.owner_id == current_user.id,
        )
    ).first()
    old_files: list[str] = []
    new_files: list[str] = []
    try:
        if existing:
            old_files = [
                s.image_filename
                for s in session.exec(
                    select(PublishedMemory).where(
                        PublishedMemory.publication_id == existing.id,
                    )
                ).all()
                if s.image_filename
            ]
            session.query(PublishedMemory).filter_by(
                publication_id=existing.id
            ).delete()
            session.query(PublishedLink).filter_by(publication_id=existing.id).delete()
            session.query(ConstellationVote).filter_by(
                publication_id=existing.id
            ).delete()
            publication = existing
            publication.revision += 1
        else:
            publication = PublishedConstellation(
                constellation_id=constellation_id,
                owner_id=current_user.id,
                title=preview.title,
                overview=preview.overview,
                author_name=name,
                author_level=preview.author_level,
            )
        publication.title = preview.title
        publication.overview = preview.overview
        publication.author_name = name
        publication.author_level = preview.author_level
        publication.published_at = datetime.utcnow()
        session.add(publication)
        session.flush()
        members = _members(session, constellation_id)
        for member, (star, source_image) in zip(members, prepared, strict=False):
            filename = None
            if source_image:
                source_name = source_image.removeprefix("disk-private://")
                if Path(source_name).name != source_name:
                    raise HTTPException(422, "Invalid image path")
                source = get_local_uploads_directory() / source_name
                if not source.is_file():
                    raise HTTPException(422, "One selected image is unavailable")
                if (
                    source.suffix.lower()
                    not in {".png", ".jpg", ".jpeg", ".webp", ".gif"}
                    or source.stat().st_size > 10 * 1024 * 1024
                ):
                    raise HTTPException(
                        422, "One selected image is not a supported image under 10 MB"
                    )
                _media_directory().mkdir(parents=True, exist_ok=True)
                filename = f"{uuid4()}{source.suffix.lower()}"
                shutil.copyfile(source, _media_directory() / filename)
                new_files.append(filename)
            session.add(
                PublishedMemory(
                    publication_id=publication.id,
                    source_story_id=member.story_id,
                    display_order=star.index,
                    title=star.title,
                    story_text=star.story_text,
                    image_filename=filename,
                    x=star.x,
                    y=star.y,
                )
            )
        story_ids = [m.story_id for m in members]
        for link in preview.links:
            a, b = sorted((story_ids[link.a], story_ids[link.b]))
            session.add(
                PublishedLink(publication_id=publication.id, story_a_id=a, story_b_id=b)
            )
        session.commit()
        session.refresh(publication)
    except Exception:
        session.rollback()
        _delete_media(new_files)
        raise
    _delete_media(old_files)
    return _published_detail(session, publication)


@router.delete("/publish/{constellation_id}", status_code=204)
def unpublish_constellation(
    constellation_id: int, session: SessionDep, current_user: CurrentUser
) -> None:
    _owned(session, current_user.id, constellation_id)
    publication = session.exec(
        select(PublishedConstellation).where(
            PublishedConstellation.constellation_id == constellation_id,
            PublishedConstellation.owner_id == current_user.id,
        )
    ).first()
    if not publication:
        raise HTTPException(404, "Published constellation not found")
    filenames = [
        s.image_filename
        for s in session.exec(
            select(PublishedMemory).where(
                PublishedMemory.publication_id == publication.id,
            )
        ).all()
        if s.image_filename
    ]
    session.delete(publication)
    session.commit()
    _delete_media(filenames)


@router.get("/", response_model=SkyPage)
def browse_sky(
    session: SessionDep,
    skip: int = 0,
    limit: int = 24,
    sort: Literal["recent", "celebrated"] = "recent",
) -> SkyPage:
    _enabled()
    if skip < 0 or not 1 <= limit <= 50:
        raise HTTPException(422, "Invalid page")
    vote_count = (
        select(
            ConstellationVote.publication_id,
            func.count(ConstellationVote.id).label("votes"),
        )
        .group_by(ConstellationVote.publication_id)
        .subquery()
    )
    star_count = (
        select(
            PublishedMemory.publication_id,
            func.count(PublishedMemory.id).label("stars"),
        )
        .group_by(PublishedMemory.publication_id)
        .subquery()
    )
    statement = select(
        PublishedConstellation,
        func.coalesce(vote_count.c.votes, 0),
        func.coalesce(star_count.c.stars, 0),
    )
    statement = statement.outerjoin(
        vote_count, vote_count.c.publication_id == PublishedConstellation.id
    )
    statement = statement.outerjoin(
        star_count, star_count.c.publication_id == PublishedConstellation.id
    )
    if sort == "celebrated":
        statement = statement.order_by(
            func.coalesce(vote_count.c.votes, 0).desc(),
            PublishedConstellation.published_at.desc(),
        )
    else:
        statement = statement.order_by(PublishedConstellation.published_at.desc())
    rows = session.exec(statement.offset(skip).limit(limit)).all()
    count = session.exec(select(func.count(PublishedConstellation.id))).one()
    publication_ids = [publication.id for publication, _, _ in rows]
    members_by_publication: dict[int, list[PublishedMemory]] = defaultdict(list)
    links_by_publication: dict[int, list[PublishedLink]] = defaultdict(list)
    if publication_ids:
        for member in session.exec(
            select(PublishedMemory)
            .where(
                PublishedMemory.publication_id.in_(publication_ids),
            )
            .order_by(PublishedMemory.publication_id, PublishedMemory.display_order)
        ).all():
            members_by_publication[member.publication_id].append(member)
        for link in session.exec(
            select(PublishedLink).where(
                PublishedLink.publication_id.in_(publication_ids),
            )
        ).all():
            links_by_publication[link.publication_id].append(link)
    data = []
    for publication, votes, stars in rows:
        members = members_by_publication[publication.id]
        visible = members[:6]
        indices = {
            member.source_story_id: index for index, member in enumerate(visible)
        }
        points = [
            SkyPoint(
                x=member.x
                if member.x is not None
                else (index + 1) / (len(members) + 1),
                y=member.y if member.y is not None else (0.28 if index % 2 else 0.68),
            )
            for index, member in enumerate(visible)
        ]
        preview_links = [
            SkyLink(a=indices[link.story_a_id], b=indices[link.story_b_id])
            for link in links_by_publication[publication.id]
            if link.story_a_id in indices and link.story_b_id in indices
        ]
        data.append(
            SkyCluster(
                id=publication.id,
                title=publication.title,
                overview_excerpt=publication.overview[:260],
                author_name=publication.author_name,
                author_level=publication.author_level,
                star_count=stars,
                votes=votes,
                published_at=publication.published_at,
                preview_stars=points,
                preview_links=preview_links,
            )
        )
    return SkyPage(data=data, count=count)


@router.get("/{publication_id}", response_model=PublicConstellation)
def read_public_constellation(
    publication_id: int, session: SessionDep
) -> PublicConstellation:
    _enabled()
    publication = session.get(PublishedConstellation, publication_id)
    if not publication:
        raise HTTPException(404, "Constellation not found")
    return _published_detail(session, publication)


@router.get("/media/{publication_id}/{filename}", include_in_schema=False)
def read_public_image(
    publication_id: int, filename: str, session: SessionDep
) -> FileResponse:
    _enabled()
    if Path(filename).name != filename:
        raise HTTPException(404, "Image not found")
    allowed = session.exec(
        select(PublishedMemory.id).where(
            PublishedMemory.publication_id == publication_id,
            PublishedMemory.image_filename == filename,
        )
    ).first()
    image = _media_directory() / filename
    if not allowed or not image.is_file():
        raise HTTPException(404, "Image not found")
    return FileResponse(image, headers={"Cache-Control": "no-store"})


@router.post("/{publication_id}/vote", response_model=VoteResult)
def vote(
    publication_id: int, session: SessionDep, current_user: CurrentUser
) -> VoteResult:
    _enabled()
    if not session.get(PublishedConstellation, publication_id):
        raise HTTPException(404, "Constellation not found")
    session.execute(
        insert(ConstellationVote)
        .values(
            publication_id=publication_id,
            user_id=current_user.id,
            created_at=datetime.utcnow(),
        )
        .on_conflict_do_nothing(index_elements=["publication_id", "user_id"])
    )
    session.commit()
    count = session.exec(
        select(func.count(ConstellationVote.id)).where(
            ConstellationVote.publication_id == publication_id,
        )
    ).one()
    return VoteResult(votes=count, voted=True)


@router.get("/{publication_id}/vote", response_model=VoteResult)
def read_vote(
    publication_id: int, session: SessionDep, current_user: CurrentUser
) -> VoteResult:
    _enabled()
    if not session.get(PublishedConstellation, publication_id):
        raise HTTPException(404, "Constellation not found")
    existing = session.exec(
        select(ConstellationVote.id).where(
            ConstellationVote.publication_id == publication_id,
            ConstellationVote.user_id == current_user.id,
        )
    ).first()
    count = session.exec(
        select(func.count(ConstellationVote.id)).where(
            ConstellationVote.publication_id == publication_id,
        )
    ).one()
    return VoteResult(votes=count, voted=bool(existing))


@router.delete("/{publication_id}/vote", response_model=VoteResult)
def unvote(
    publication_id: int, session: SessionDep, current_user: CurrentUser
) -> VoteResult:
    _enabled()
    existing = session.exec(
        select(ConstellationVote).where(
            ConstellationVote.publication_id == publication_id,
            ConstellationVote.user_id == current_user.id,
        )
    ).first()
    if existing:
        session.delete(existing)
        session.commit()
    count = session.exec(
        select(func.count(ConstellationVote.id)).where(
            ConstellationVote.publication_id == publication_id,
        )
    ).one()
    return VoteResult(votes=count, voted=False)


@router.post("/{publication_id}/report", status_code=204)
def report_constellation(
    publication_id: int,
    body: ReportRequest,
    session: SessionDep,
    current_user: CurrentUser,
) -> None:
    _enabled()
    if not session.get(PublishedConstellation, publication_id):
        raise HTTPException(404, "Constellation not found")
    reason = body.reason.strip()
    if len(reason) < 10:
        raise HTTPException(422, "Please add a little more detail to the report")
    session.execute(
        insert(ConstellationReport)
        .values(
            publication_id=publication_id,
            user_id=current_user.id,
            reason=reason,
            status="open",
            created_at=datetime.utcnow(),
        )
        .on_conflict_do_nothing(index_elements=["publication_id", "user_id"])
    )
    session.commit()


@router.get(
    "/admin/reports",
    response_model=list[ReportAdmin],
    dependencies=[Depends(get_current_active_superuser)],
)
def list_reports(
    session: SessionDep, skip: int = 0, limit: int = 50
) -> list[ConstellationReport]:
    if skip < 0 or not 1 <= limit <= 100:
        raise HTTPException(422, "Invalid page")
    return session.exec(
        select(ConstellationReport)
        .order_by(
            ConstellationReport.created_at.desc(),
        )
        .offset(skip)
        .limit(limit)
    ).all()


@router.post(
    "/admin/reports/{report_id}/resolve",
    status_code=204,
    dependencies=[Depends(get_current_active_superuser)],
)
def resolve_report(report_id: int, session: SessionDep) -> None:
    report = session.get(ConstellationReport, report_id)
    if not report:
        raise HTTPException(404, "Report not found")
    report.status = "resolved"
    session.add(report)
    session.commit()


@router.delete(
    "/admin/{publication_id}",
    status_code=204,
    dependencies=[Depends(get_current_active_superuser)],
)
def hide_publication(publication_id: int, session: SessionDep) -> None:
    publication = session.get(PublishedConstellation, publication_id)
    if not publication:
        raise HTTPException(404, "Constellation not found")
    filenames = [
        s.image_filename
        for s in session.exec(
            select(PublishedMemory).where(
                PublishedMemory.publication_id == publication_id,
            )
        ).all()
        if s.image_filename
    ]
    session.delete(publication)
    session.commit()
    _delete_media(filenames)
