import { describe, it, expect } from 'vitest'
import { authErrorToRu } from './authStore'

describe('authErrorToRu', () => {
  it('maps known API messages to Russian', () => {
    expect(authErrorToRu('Incorrect email or password')).toBe('Неверный email или пароль')
    expect(authErrorToRu('User account is inactive')).toBe('Учётная запись деактивирована')
    expect(authErrorToRu('Email already registered')).toBe('Этот email уже зарегистрирован')
    expect(authErrorToRu('Username already taken')).toBe('Имя пользователя уже занято')
  })

  it('returns first element for array detail', () => {
    expect(authErrorToRu(['Email already registered', 'x'])).toBe('Этот email уже зарегистрирован')
  })

  it('passes through unknown strings', () => {
    expect(authErrorToRu('Custom server message')).toBe('Custom server message')
  })

  it('handles empty input', () => {
    expect(authErrorToRu('')).toBe('Ошибка')
    expect(authErrorToRu([] as unknown as string)).toBe('Ошибка')
  })
})
