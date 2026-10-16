"""Single shared slowapi limiter for all routers.

One instance is used everywhere so rate-limit counters and the app-level
exception handler are backed by the same storage.

Proxy-aware key function for Vercel/load-balancer deployments.
"""
from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address


def get_client_ip(request: Request) -> str:
    """Extract real client IP behind proxies (Vercel, Cloudflare, etc.)."""
    # Vercel: x-forwarded-for contains original client IP
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        # Take first IP (original client), strip whitespace
        return forwarded.split(",")[0].strip()
    # Cloudflare: cf-connecting-ip header
    cf_ip = request.headers.get("cf-connecting-ip")
    if cf_ip:
        return cf_ip.strip()
    # Fallback to direct connection
    return get_remote_address(request)


limiter = Limiter(key_func=get_client_ip)
