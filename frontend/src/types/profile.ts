/** Соответствует backend app/profile_prefs.DEFAULT_PROFILE_PREFERENCES */
export type ProfilePreferences = {
  ui?: {
    compact_level_hub?: boolean
    reduced_motion?: boolean
  }
  learning?: {
    chat_default_spoiler?: boolean
    show_golden_after_complete?: boolean
  }
  privacy?: {
    hide_stats_on_public?: boolean
    hide_achievements_on_public?: boolean
  }
}

export function defaultProfilePreferences(): Required<{
  ui: Required<NonNullable<ProfilePreferences['ui']>>
  learning: Required<NonNullable<ProfilePreferences['learning']>>
  privacy: Required<NonNullable<ProfilePreferences['privacy']>>
}> {
  return {
    ui: { compact_level_hub: false, reduced_motion: false },
    learning: { chat_default_spoiler: false, show_golden_after_complete: true },
    privacy: { hide_stats_on_public: false, hide_achievements_on_public: false },
  }
}

export function mergeProfilePreferences(
  apiPrefs: ProfilePreferences | null | undefined
): ReturnType<typeof defaultProfilePreferences> {
  const d = defaultProfilePreferences()
  if (!apiPrefs || typeof apiPrefs !== 'object') return d
  return {
    ui: { ...d.ui, ...(apiPrefs.ui || {}) },
    learning: { ...d.learning, ...(apiPrefs.learning || {}) },
    privacy: { ...d.privacy, ...(apiPrefs.privacy || {}) },
  }
}
