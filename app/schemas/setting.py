from pydantic import BaseModel, Field


class EmailSettingsIn(BaseModel):
    """SMTP channel config. `password` is a secret — a blank/`********` value
    on update means "keep the existing stored password" (never returned by GET)."""

    enabled: bool = False
    host: str = Field(default="", max_length=255)
    port: int = Field(default=587, ge=1, le=65535)
    username: str = Field(default="", max_length=255)
    password: str | None = Field(default=None, max_length=512)
    from_email: str = Field(default="", max_length=255)
    from_name: str = Field(default="", max_length=255)
    use_tls: bool = True


class EmailSettingsOut(BaseModel):
    """Email channel state returned to the UI — secrets are NEVER included."""

    enabled: bool
    host: str
    port: int
    username: str
    password_set: bool
    from_email: str
    from_name: str
    use_tls: bool


class SmsSettingsIn(BaseModel):
    """SMS provider config (Twilio, Africa's Talking, Vonage, ...).
    `api_key`/`api_secret` are secrets — blank/`********` on update keeps the
    existing stored values."""

    enabled: bool = False
    provider: str = Field(default="", max_length=100)
    api_key: str | None = Field(default=None, max_length=512)
    api_secret: str | None = Field(default=None, max_length=512)
    sender_id: str = Field(default="", max_length=50)


class SmsSettingsOut(BaseModel):
    """SMS channel state returned to the UI — secrets are NEVER included."""

    enabled: bool
    provider: str
    api_key_set: bool
    api_secret_set: bool
    sender_id: str


class NotificationSettingsOut(BaseModel):
    email: EmailSettingsOut
    sms: SmsSettingsOut
    email_ready: bool
    sms_ready: bool


class ReminderSettingsIn(BaseModel):
    """Automated payment-link reminder schedule (admin configured).

    The school sets a start date, how often reminders repeat and how many to
    send. Each reminder SMS carries a secure per-student pay-by-link for the
    parent's current outstanding balance.
    """

    enabled: bool = False
    start_date: str = Field(default="", max_length=10)  # YYYY-MM-DD
    interval_days: int = Field(default=7, ge=1, le=60)
    count: int = Field(default=4, ge=1, le=12)


class ReminderSettingsOut(BaseModel):
    """Reminder schedule state returned to the UI (no secrets involved)."""

    enabled: bool
    start_date: str
    interval_days: int
    count: int
    last_run_date: str | None = None
    next_run_date: str | None = None


class AutoGenerationSettingsIn(BaseModel):
    """Monthly whole-school invoice + statement auto-generation (admin configured).

    On ``day_of_month`` the scheduler generates that month's invoices for every
    approved student, then that month's statements for every student. Existing
    invoices and statements are skipped, so a re-run never duplicates them or
    re-sends SMS. The day is capped at 28 so the slot fires in every month,
    including February.
    """

    enabled: bool = False
    day_of_month: int = Field(default=1, ge=1, le=28)
    notify_parents: bool = True


class AutoGenerationSettingsOut(AutoGenerationSettingsIn):
    """Schedule state returned to the UI (no secrets involved)."""

    last_run_date: str | None = None
    next_run_date: str | None = None
