/** Соответствует backend app/profile_prefs.DEFAULT_PROFILE_PREFERENCES */
export type ProfilePreferences = {
  ui?: {
    compact_level_hub?: boolean
    reduced_motion?: boolean
    performance_mode?: boolean
  }
  learning?: {
    chat_default_spoiler?: boolean
    show_golden_after_complete?: boolean
  }
  privacy?: {
    hide_stats_on_public?: boolean
    hide_achievements_on_public?: boolean
    hide_bio_on_public?: boolean
    hide_tagline_on_public?: boolean
  }
  notifications?: {
    quiet_mode?: boolean
    digest_mode?: 'instant' | 'daily'
    push_in_app?: boolean
  }
}

export function defaultProfilePreferences(): Required<{
  ui: Required<NonNullable<ProfilePreferences['ui']>>
  learning: Required<NonNullable<ProfilePreferences['learning']>>
  privacy: Required<NonNullable<ProfilePreferences['privacy']>>
  notifications: Required<NonNullable<ProfilePreferences['notifications']>>
}> {
  return {
    ui: { compact_level_hub: false, reduced_motion: false, performance_mode: false },
    learning: { chat_default_spoiler: false, show_golden_after_complete: true },
    privacy: {
      hide_stats_on_public: false,
      hide_achievements_on_public: false,
      hide_bio_on_public: false,
      hide_tagline_on_public: false,
    },
    notifications: {
      quiet_mode: false,
      digest_mode: 'instant',
      push_in_app: false,
    },
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
    notifications: { ...d.notifications, ...(apiPrefs.notifications || {}) },
  }
}
