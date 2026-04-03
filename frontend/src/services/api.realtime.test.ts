import { describe, expect, it } from 'vitest'
import { createWsUrl } from './api'

describe('createWsUrl', () => {
  it('creates ws url with token', () => {
    const url = createWsUrl('/api/v1/realtime/notifications/ws', 'abc')
    expect(url.includes('/api/v1/realtime/notifications/ws')).toBe(true)
    expect(url.includes('token=abc')).toBe(true)
    expect(url.startsWith('ws')).toBe(true)
  })
})
