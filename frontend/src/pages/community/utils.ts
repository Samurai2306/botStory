export const formatDate = (s: string) => {
  const d = new Date(s)
  return d.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export const getApiError = (err: any, fallback: string): string => {
  const d = err.response?.data?.detail
  if (typeof d === 'string') return d
  if (Array.isArray(d) && d.length) return d.map((x: any) => x.msg || JSON.stringify(x)).join('. ')
  const status = err.response?.status
  if (status === 401) return 'Войдите в аккаунт'
  if (status === 500) return 'Ошибка сервера. Возможно, не применена миграция БД (alembic upgrade head в контейнере backend).'
  return fallback
}
