"""Tests for the payment-link reminder scheduling logic (pure functions)."""

from datetime import date

import pytest

from app.services.reminder import due_reminder_index, next_run_date


@pytest.fixture(autouse=True)
def setup_database():
    """Shadow conftest's DB setup fixture — these tests are pure logic."""
    yield


# Schedule: start 2026-08-01, every 4 days, 4 reminders
#  -> reminder 1 on Aug 1, 2 on Aug 5, 3 on Aug 9, 4 on Aug 13
CFG = {
    "enabled": True,
    "start_date": "2026-08-01",
    "interval_days": 4,
    "count": 4,
    "last_run_date": "",
}


def test_disabled_schedule_never_fires():
    assert due_reminder_index({**CFG, "enabled": False}, date(2026, 8, 1)) is None
    assert next_run_date({**CFG, "enabled": False}, date(2026, 8, 1)) is None


def test_missing_start_date_never_fires():
    cfg = {**CFG, "start_date": ""}
    assert due_reminder_index(cfg, date(2026, 8, 1)) is None
    assert next_run_date(cfg, date(2026, 8, 1)) is None


def test_fires_on_start_date():
    assert due_reminder_index(CFG, date(2026, 8, 1)) == 0  # reminder 1


def test_fires_every_interval():
    assert due_reminder_index(CFG, date(2026, 8, 5)) == 1  # reminder 2
    assert due_reminder_index(CFG, date(2026, 8, 9)) == 2  # reminder 3
    assert due_reminder_index(CFG, date(2026, 8, 13)) == 3  # reminder 4


def test_does_not_fire_on_off_days():
    assert due_reminder_index(CFG, date(2026, 8, 2)) is None
    assert due_reminder_index(CFG, date(2026, 8, 3)) is None
    assert due_reminder_index(CFG, date(2026, 8, 6)) is None


def test_stops_after_count():
    assert due_reminder_index(CFG, date(2026, 8, 17)) is None  # 5th would be out of range
    assert due_reminder_index(CFG, date(2026, 9, 1)) is None


def test_before_start_never_fires():
    assert due_reminder_index(CFG, date(2026, 7, 31)) is None


def test_invalid_start_date_never_fires():
    assert due_reminder_index({**CFG, "start_date": "not-a-date"}, date(2026, 8, 1)) is None


def test_next_run_date():
    assert next_run_date(CFG, date(2026, 7, 1)) == date(2026, 8, 1)
    assert next_run_date(CFG, date(2026, 8, 1)) == date(2026, 8, 1)
    assert next_run_date(CFG, date(2026, 8, 2)) == date(2026, 8, 5)
    assert next_run_date(CFG, date(2026, 8, 14)) is None  # schedule exhausted


def test_next_run_date_after_count_exhausted():
    assert next_run_date({**CFG, "count": 1}, date(2026, 8, 2)) is None
