from celery import Celery
from celery.schedules import crontab

from app.core.config import get_settings

settings = get_settings()

celery_app = Celery(
    "school_finance",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.REDIS_URL,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
)

# Daily beat jobs. The reminder scheduler is a lightweight daily check — the
# admin-configured start date / interval / count decide whether anything
# actually fires that day.
celery_app.conf.beat_schedule = {
    "run-payment-link-reminders-daily": {
        "task": "tasks.run_reminder_scheduler",
        "schedule": crontab(hour=8, minute=0),
    },
}

celery_app.autodiscover_tasks(["app.tasks"])
