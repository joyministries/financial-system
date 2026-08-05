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
