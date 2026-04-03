from __future__ import annotations

from hashlib import md5
from typing import Dict, List


AVATAR_GROUPS: Dict[str, int] = {
    "robots": 10,
    "cats": 5,
    "dogs": 5,
    "animals": 5,
    "neutral": 5,
}

COLOR_PALETTES = [
    ("#2DD4BF", "#0F172A", "#A78BFA"),
    ("#F59E0B", "#1F2937", "#10B981"),
    ("#60A5FA", "#111827", "#F472B6"),
    ("#F97316", "#172554", "#22D3EE"),
    ("#84CC16", "#1E293B", "#FB7185"),
    ("#E879F9", "#0B1020", "#34D399"),
]


def list_avatar_keys() -> List[str]:
    keys: List[str] = []
    for group, total in AVATAR_GROUPS.items():
        for i in range(1, total + 1):
            keys.append(f"{group}_{i:02d}")
    return keys


def avatar_catalog() -> Dict[str, List[dict]]:
    out: Dict[str, List[dict]] = {}
    for group, total in AVATAR_GROUPS.items():
        out[group] = [
            {
                "key": f"{group}_{i:02d}",
                "url": f"/api/v1/users/avatars/{group}_{i:02d}.svg",
            }
            for i in range(1, total + 1)
        ]
    return out


def is_valid_avatar_key(key: str | None) -> bool:
    if not key:
        return False
    return key in set(list_avatar_keys())


def render_avatar_svg(key: str) -> str:
    digest = md5(key.encode("utf-8")).hexdigest()
    seed = int(digest[:8], 16)
    bg, stroke, accent = COLOR_PALETTES[seed % len(COLOR_PALETTES)]
    glow = COLOR_PALETTES[(seed // 7) % len(COLOR_PALETTES)][0]
    kind = key.split("_", 1)[0]
    eye_shift = 8 + (seed % 16)
    pupil_shift = (seed % 5) - 2
    tilt = -4 + (seed % 9)
    badge_style = seed % 4

    base_defs = f"""
<defs>
  <linearGradient id="bgGrad" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="#080d1f"/>
    <stop offset="100%" stop-color="#121a32"/>
  </linearGradient>
  <radialGradient id="headGrad" cx="35%" cy="25%" r="80%">
    <stop offset="0%" stop-color="{glow}" stop-opacity="0.45"/>
    <stop offset="100%" stop-color="{bg}" stop-opacity="1"/>
  </radialGradient>
  <linearGradient id="accentGrad" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0%" stop-color="{accent}"/>
    <stop offset="100%" stop-color="{glow}"/>
  </linearGradient>
  <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
    <feDropShadow dx="0" dy="4" stdDeviation="5" flood-color="#000" flood-opacity="0.35"/>
  </filter>
  <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
    <feGaussianBlur stdDeviation="2.2" result="blur"/>
    <feMerge>
      <feMergeNode in="blur"/>
      <feMergeNode in="SourceGraphic"/>
    </feMerge>
  </filter>
</defs>
"""

    eye_group = f"""
<g>
  <ellipse cx="{92 - eye_shift}" cy="116" rx="16" ry="13" fill="#ecfeff"/>
  <ellipse cx="{164 + eye_shift}" cy="116" rx="16" ry="13" fill="#ecfeff"/>
  <circle cx="{92 - eye_shift + pupil_shift}" cy="116" r="6" fill="{stroke}"/>
  <circle cx="{164 + eye_shift + pupil_shift}" cy="116" r="6" fill="{stroke}"/>
  <circle cx="{90 - eye_shift + pupil_shift}" cy="113" r="2" fill="#fff" opacity="0.8"/>
  <circle cx="{162 + eye_shift + pupil_shift}" cy="113" r="2" fill="#fff" opacity="0.8"/>
</g>
"""

    badge = ""
    if badge_style == 0:
        badge = '<circle cx="196" cy="62" r="12" fill="url(#accentGrad)" stroke="#f8fafc" stroke-width="2"/>'
    elif badge_style == 1:
        badge = '<rect x="184" y="50" width="24" height="24" rx="6" fill="url(#accentGrad)" stroke="#f8fafc" stroke-width="2"/>'
    elif badge_style == 2:
        badge = '<path d="M196 48 L208 72 L184 72 Z" fill="url(#accentGrad)" stroke="#f8fafc" stroke-width="2"/>'
    else:
        badge = '<path d="M196 48 L206 58 L196 74 L186 58 Z" fill="url(#accentGrad)" stroke="#f8fafc" stroke-width="2"/>'

    if kind == "robots":
        head = f"""
<g transform="rotate({tilt} 128 128)" filter="url(#softShadow)">
  <rect x="46" y="44" width="164" height="164" rx="28" fill="url(#headGrad)" stroke="{stroke}" stroke-width="7"/>
  <rect x="66" y="72" width="124" height="20" rx="10" fill="rgba(15,23,42,0.55)" stroke="{accent}" stroke-width="2"/>
  <rect x="100" y="30" width="56" height="18" rx="8" fill="{accent}" stroke="{stroke}" stroke-width="4"/>
  <circle cx="128" cy="28" r="8" fill="{glow}" filter="url(#glow)"/>
  {eye_group}
  <rect x="86" y="150" width="84" height="24" rx="8" fill="#0f172a" stroke="{accent}" stroke-width="4"/>
  <path d="M96 162 L108 162 M116 162 L128 162 M136 162 L148 162 M156 162 L164 162" stroke="#e2e8f0" stroke-width="3" stroke-linecap="round"/>
  <circle cx="76" cy="178" r="6" fill="{accent}"/>
  <circle cx="180" cy="178" r="6" fill="{accent}"/>
  {badge}
</g>
"""
    elif kind == "cats":
        whisk = 136 + (seed % 10)
        head = f"""
<g transform="rotate({tilt} 128 128)" filter="url(#softShadow)">
  <path d="M70 78 L92 32 L112 80 Z" fill="url(#headGrad)" stroke="{stroke}" stroke-width="6"/>
  <path d="M186 78 L164 32 L144 80 Z" fill="url(#headGrad)" stroke="{stroke}" stroke-width="6"/>
  <circle cx="128" cy="126" r="86" fill="url(#headGrad)" stroke="{stroke}" stroke-width="7"/>
  {eye_group}
  <path d="M116 {whisk} Q128 {whisk + 8} 140 {whisk}" stroke="{stroke}" stroke-width="6" fill="none" stroke-linecap="round"/>
  <path d="M126 132 L130 132 L128 138 Z" fill="{accent}" stroke="{stroke}" stroke-width="2"/>
  <path d="M72 136 L104 132 M72 146 L104 142 M72 156 L104 152" stroke="{stroke}" stroke-width="3" stroke-linecap="round" opacity="0.8"/>
  <path d="M184 132 L152 136 M184 142 L152 146 M184 152 L152 156" stroke="{stroke}" stroke-width="3" stroke-linecap="round" opacity="0.8"/>
  {badge}
</g>
"""
    elif kind == "dogs":
        droop = 36 + (seed % 9)
        head = f"""
<g transform="rotate({tilt} 128 128)" filter="url(#softShadow)">
  <ellipse cx="72" cy="112" rx="26" ry="{droop}" fill="{accent}" stroke="{stroke}" stroke-width="6"/>
  <ellipse cx="184" cy="112" rx="26" ry="{droop}" fill="{accent}" stroke="{stroke}" stroke-width="6"/>
  <circle cx="128" cy="126" r="84" fill="url(#headGrad)" stroke="{stroke}" stroke-width="7"/>
  {eye_group}
  <ellipse cx="128" cy="144" rx="16" ry="11" fill="#111827"/>
  <path d="M100 164 Q128 184 156 164" stroke="{stroke}" stroke-width="7" fill="none" stroke-linecap="round"/>
  <circle cx="108" cy="168" r="4" fill="{accent}"/>
  <circle cx="148" cy="168" r="4" fill="{accent}"/>
  {badge}
</g>
"""
    elif kind == "animals":
        head = f"""
<g transform="rotate({tilt} 128 128)" filter="url(#softShadow)">
  <ellipse cx="128" cy="124" rx="88" ry="82" fill="url(#headGrad)" stroke="{stroke}" stroke-width="7"/>
  <ellipse cx="78" cy="78" rx="20" ry="18" fill="{accent}" stroke="{stroke}" stroke-width="5"/>
  <ellipse cx="178" cy="78" rx="20" ry="18" fill="{accent}" stroke="{stroke}" stroke-width="5"/>
  <ellipse cx="128" cy="146" rx="30" ry="22" fill="rgba(241,245,249,0.88)" stroke="{stroke}" stroke-width="3"/>
  {eye_group}
  <circle cx="118" cy="144" r="4" fill="{stroke}"/>
  <circle cx="138" cy="144" r="4" fill="{stroke}"/>
  <path d="M112 160 Q128 170 144 160" stroke="{stroke}" stroke-width="5" fill="none" stroke-linecap="round"/>
  {badge}
</g>
"""
    else:  # neutral
        head = f"""
<g transform="rotate({tilt} 128 128)" filter="url(#softShadow)">
  <path d="M128 28 L196 66 L196 144 L128 186 L60 144 L60 66 Z" fill="url(#headGrad)" stroke="{stroke}" stroke-width="7"/>
  <path d="M128 186 L196 144 L196 188 L128 228 L60 188 L60 144 Z" fill="rgba(15,23,42,0.35)" stroke="{stroke}" stroke-width="5"/>
  {eye_group}
  <rect x="90" y="148" width="76" height="18" rx="9" fill="#0f172a" stroke="{accent}" stroke-width="3"/>
  <path d="M98 157 L158 157" stroke="#e2e8f0" stroke-width="3" stroke-linecap="round"/>
  {badge}
</g>
"""

    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" role="img" aria-label="{key}">
{base_defs}
<rect width="256" height="256" rx="42" fill="url(#bgGrad)"/>
<circle cx="52" cy="44" r="28" fill="{accent}" opacity="0.15"/>
<circle cx="212" cy="208" r="34" fill="{glow}" opacity="0.12"/>
<rect x="14" y="14" width="228" height="228" rx="36" fill="none" stroke="rgba(255,255,255,0.14)" stroke-width="2"/>
{head}
</svg>"""
    return svg
