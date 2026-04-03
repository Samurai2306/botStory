"""Defaults and merge helpers for users.profile_preferences JSON."""
from __future__ import annotations

from copy import deepcopy
from typing import Any, Dict, Optional

DEFAULT_PROFILE_PREFERENCES: Dict[str, Any] = {
    "ui": {
        "compact_level_hub": False,
        "reduced_motion": False,
    },
    "learning": {
        "chat_default_spoiler": False,
        "show_golden_after_complete": True,
    },
    "privacy": {
        "hide_stats_on_public": False,
        "hide_achievements_on_public": False,
        "hide_bio_on_public": False,
        "hide_tagline_on_public": False,
    },
    "notifications": {
        "quiet_mode": False,
        "digest_mode": "instant",
        "push_in_app": False,
    },
}


def _deep_merge(base: Dict[str, Any], patch: Dict[str, Any]) -> Dict[str, Any]:
    out = deepcopy(base)
    for key, val in patch.items():
        if (
            key in out
            and isinstance(out[key], dict)
            and isinstance(val, dict)
        ):
            out[key] = _deep_merge(out[key], val)
        else:
            out[key] = val
    return out


def merged_preferences(stored: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not stored:
        return deepcopy(DEFAULT_PROFILE_PREFERENCES)
    return _deep_merge(DEFAULT_PROFILE_PREFERENCES, stored)


def apply_preferences_patch(
    stored: Optional[Dict[str, Any]], patch: Dict[str, Any]
) -> Dict[str, Any]:
    current = merged_preferences(stored)
    return _deep_merge(current, patch)
