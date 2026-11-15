import { useSyncExternalStore } from 'react'

export interface AuthUser {
  name: string
  email: string
}

interface AuthState {
  user: AuthUser | null
  accessToken: string
}

const ACCESS_TOKEN = 'bench_access_token'

let state: AuthState = {
  user: { name: 'Olivia Martin', email: 'olivia@example.com' },
  accessToken: 'tok_demo_123',
}
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

function writeCookie(value: string) {
  if (typeof document === 'undefined') return
  document.cookie = value ? `${ACCESS_TOKEN}=${value}; path=/` : `${ACCESS_TOKEN}=; path=/; max-age=0`
}

export const authStore = {
  getState: () => state,
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
  setUser(user: AuthUser | null) {
    state = { ...state, user }
    emit()
  },
  setAccessToken(accessToken: string) {
    writeCookie(accessToken)
    state = { ...state, accessToken }
    emit()
  },
  resetAccessToken() {
    writeCookie('')
    state = { ...state, accessToken: '' }
    emit()
  },
  reset() {
    writeCookie('')
    state = { ...state, user: null, accessToken: '' }
    emit()
  },
}

export function useAuth<T>(selector: (s: AuthState) => T): T {
  return useSyncExternalStore(
    authStore.subscribe,
    () => selector(state),
    () => selector(state),
  )
}
