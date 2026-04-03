export const CATEGORIES = [
  { value: '', label: 'Все' },
  { value: 'discussion', label: 'Обсуждение' },
  { value: 'question', label: 'Вопрос' },
  { value: 'idea', label: 'Идея' },
  { value: 'announcement', label: 'Объявление' },
] as const

export const SORT_OPTIONS = [
  { value: 'new', label: 'Сначала новые' },
  { value: 'popular', label: 'По популярности' },
  { value: 'pinned_first', label: 'Закреплённые сверху' },
] as const
