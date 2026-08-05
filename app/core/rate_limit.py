"""Single shared slowapi limiter for all routers.

One instance is used everywhere so rate-limit counters and the app-level
exception handler are backed by the same storage.
"""

from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
