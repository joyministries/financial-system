"""Shared input guards for user-visible person/name fields.

Names are rendered in multiple contexts (React pages, print windows built
with document.write, audit logs). We reject HTML metacharacters and control
characters at the API boundary so a stored-XSS payload can never persist
even if a frontend sink is missed.
"""

from math import ceil
from typing import Annotated

from pydantic import AfterValidator, BaseModel, Field

_HTML_META = set("<>")
_CONTROL = set(chr(c) for c in range(32)) | set("\x7f")


def _assert_safe_person_name(value: str) -> str:
    bad = _HTML_META.union(_CONTROL)
    if any(c in value for c in bad):
        raise ValueError("Name must not contain HTML or control characters")
    return value


SafeName = Annotated[
    str, Field(min_length=1, max_length=100), AfterValidator(_assert_safe_person_name)
]

# Full names / display names may be slightly longer.
SafeFullName = Annotated[
    str, Field(min_length=1, max_length=255), AfterValidator(_assert_safe_person_name)
]

# Optional variant (None allowed) for name fields on optional records.
SafeNameOptional = Annotated[
    str | None,
    Field(default=None, min_length=1, max_length=100),
    AfterValidator(_assert_safe_person_name),
]

SafeFullNameOptional = Annotated[
    str | None,
    Field(default=None, min_length=1, max_length=255),
    AfterValidator(_assert_safe_person_name),
]


class CountResponse(BaseModel):
    """Generic { total } payload for paginated list endpoints."""

    total: int


class PageResponse[T](BaseModel):
    """Self-describing pagination envelope returned by list endpoints.

    The server always applies LIMIT/OFFSET at the database level — only
    `page_size` rows are ever fetched or transferred. `total` comes from a
    cheap ``count(*)`` and the remaining fields are derived from it, so the
    client never needs a second request (or client-side maths) to render
    pagination controls.
    """

    items: list[T]
    page: int
    page_size: int
    total_pages: int
    total: int
    has_next_page: bool
    has_previous_page: bool


def build_page_response[T](
    items: list[T],
    total: int,
    limit: int,
    offset: int,
) -> PageResponse[T]:
    """Wrap a page of rows into a self-describing PageResponse.

    `items` must already be the limit/offset slice; `total` must be the
    matching count(*) — this helper never loads more rows than `limit`.
    """
    page = (offset // limit) + 1 if limit > 0 else 1
    total_pages = ceil(total / limit) if limit > 0 else (1 if total else 0)
    return PageResponse(
        items=items,
        page=page,
        page_size=limit,
        total_pages=total_pages,
        total=total,
        has_next_page=page < total_pages,
        has_previous_page=page > 1,
    )
