"""Shared input guards for user-visible person/name fields.

Names are rendered in multiple contexts (React pages, print windows built
with document.write, audit logs). We reject HTML metacharacters and control
characters at the API boundary so a stored-XSS payload can never persist
even if a frontend sink is missed.
"""

from typing import Annotated

from pydantic import AfterValidator, Field

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
