"""Shared student-name heuristics."""


def is_test_name(first_name: str | None, last_name: str | None) -> bool:
    """True for obvious test/demo seed students ("Test child", "Demo 1", ...).

    Real learners are never excluded: the match is a word-start on either
    name part, which no ordinary name satisfies. Used by the report and
    ledger services so dummy accounts never reach reports, exports or
    dashboards.
    """
    for name in (first_name, last_name):
        if name and name.strip().lower().startswith(("test", "demo")):
            return True
    return False
