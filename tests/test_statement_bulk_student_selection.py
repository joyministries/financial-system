"""Regression tests for which students bulk statement PDFs render.

``GET /students/`` filters on ``Student.is_active`` (``StudentService.list_all``)
but the bulk statement downloads selected purely on
``registration_status == "approved"``. Students who were deactivated kept their
approved status, so the school/grade bundles rendered them anyway — appearing in
finance PDFs as zero-payment accounts with no presence in the app or in the
legacy workbook.

Selection now goes through ``_approved_students_query`` and excludes
deactivated students unless finance explicitly asks for them.
"""

from app.api.v1.financial import _approved_students_query


def _where(stmt) -> str:
    """The WHERE clause only — the SELECT column list always names every column."""
    sql = str(stmt.compile())
    return sql.split("WHERE", 1)[1] if "WHERE" in sql else ""


class TestInactiveStudentsExcludedByDefault:
    def test_default_excludes_inactive(self):
        where = _where(_approved_students_query())
        assert "is_active" in where
        assert "registration_status" in where

    def test_default_binds_is_active_true(self):
        where = _where(_approved_students_query())
        assert "students.is_active" in where
        assert "students.is_active = true" in where.lower()

    def test_explicit_false_matches_default(self):
        assert _where(_approved_students_query(include_inactive=False)) == _where(
            _approved_students_query()
        )


class TestOptInIncludesInactive:
    def test_include_inactive_drops_is_active_filter(self):
        where = _where(_approved_students_query(include_inactive=True))
        assert "is_active" not in where
        assert "registration_status" in where

    def test_opt_in_differs_from_default(self):
        assert _where(_approved_students_query(include_inactive=True)) != _where(
            _approved_students_query()
        )


class TestGradeScoping:
    def test_grade_id_filters_when_given(self):
        where = _where(_approved_students_query(grade_id="grade-uuid"))
        assert "grade_id" in where
        assert "is_active" in where

    def test_no_grade_id_means_no_grade_filter(self):
        assert "grade_id" not in _where(_approved_students_query())

    def test_grade_and_inactive_combined(self):
        where = _where(_approved_students_query(grade_id="grade-uuid", include_inactive=True))
        assert "grade_id" in where
        assert "is_active" not in where

    def test_approval_filter_always_present(self):
        for kwargs in ({}, {"grade_id": "g"}, {"include_inactive": True}):
            assert "registration_status" in _where(_approved_students_query(**kwargs))
