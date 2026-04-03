from __future__ import annotations

import asyncio
import math
import time
from collections import defaultdict, deque
from dataclasses import dataclass

from app.core.config import settings


@dataclass
class LoginGuardDecision:
    allowed: bool
    error_code: str | None = None
    message: str | None = None
    retry_after_seconds: int | None = None


_failures_by_ip: dict[str, deque[float]] = defaultdict(deque)
_failures_by_account: dict[str, deque[float]] = defaultdict(deque)
_account_lock_until: dict[str, float] = {}


def _trim_events(events: deque[float], now: float, window: int) -> None:
    cutoff = now - window
    while events and events[0] < cutoff:
        events.popleft()


def _clean_lockouts(now: float) -> None:
    expired = [acc for acc, until in _account_lock_until.items() if until <= now]
    for acc in expired:
        _account_lock_until.pop(acc, None)


def evaluate_login_attempt(ip: str, account: str) -> LoginGuardDecision:
    now = time.time()
    window = settings.LOGIN_RATE_LIMIT_WINDOW_SECONDS

    _clean_lockouts(now)
    ip_events = _failures_by_ip[ip]
    account_events = _failures_by_account[account]
    _trim_events(ip_events, now, window)
    _trim_events(account_events, now, window)

    if len(ip_events) >= settings.LOGIN_MAX_ATTEMPTS_PER_IP:
        return LoginGuardDecision(
            allowed=False,
            error_code="AUTH_RATE_LIMITED",
            message="Too many login attempts. Please try again later.",
            retry_after_seconds=window,
        )

    lock_until = _account_lock_until.get(account)
    if lock_until and lock_until > now:
        retry = max(1, int(math.ceil(lock_until - now)))
        return LoginGuardDecision(
            allowed=False,
            error_code="AUTH_ACCOUNT_LOCKED",
            message="Account temporarily locked due to repeated failed attempts.",
            retry_after_seconds=retry,
        )

    return LoginGuardDecision(allowed=True)


def register_failed_login(ip: str, account: str) -> None:
    now = time.time()
    window = settings.LOGIN_RATE_LIMIT_WINDOW_SECONDS
    ip_events = _failures_by_ip[ip]
    account_events = _failures_by_account[account]
    ip_events.append(now)
    account_events.append(now)
    _trim_events(ip_events, now, window)
    _trim_events(account_events, now, window)

    if len(account_events) >= settings.LOGIN_MAX_ATTEMPTS_PER_ACCOUNT:
        _account_lock_until[account] = now + settings.LOGIN_LOCKOUT_SECONDS


def register_successful_login(account: str) -> None:
    _failures_by_account.pop(account, None)
    _account_lock_until.pop(account, None)


async def apply_progressive_delay(ip: str, account: str) -> None:
    now = time.time()
    window = settings.LOGIN_RATE_LIMIT_WINDOW_SECONDS
    count = max(len(_failures_by_ip[ip]), len(_failures_by_account[account]))
    threshold = settings.LOGIN_DELAY_AFTER_FAILURES
    if count < threshold:
        return
    raw_delay = 0.2 * (2 ** (count - threshold))
    delay = min(raw_delay, settings.LOGIN_MAX_PROGRESSIVE_DELAY_SECONDS)
    _trim_events(_failures_by_ip[ip], now, window)
    _trim_events(_failures_by_account[account], now, window)
    await asyncio.sleep(delay)


def reset_login_protection_state() -> None:
    _failures_by_ip.clear()
    _failures_by_account.clear()
    _account_lock_until.clear()
