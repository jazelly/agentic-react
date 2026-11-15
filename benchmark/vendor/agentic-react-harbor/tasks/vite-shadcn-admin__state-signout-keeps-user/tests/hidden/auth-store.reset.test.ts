// Hidden check (copied in by the checker, removed afterwards). Not shown to the agent.
import { describe, expect, it } from 'vitest'
import { useAuthStore } from '@/stores/auth-store'

describe('auth store reset (sign out)', () => {
  it('clears user and access token', () => {
    const { auth } = useAuthStore.getState()
    auth.setUser({ accountNo: 'ACC001', email: 'a@b.c', role: ['user'], exp: Date.now() + 60_000 } as never)
    auth.setAccessToken('token-123')
    useAuthStore.getState().auth.reset()
    const after = useAuthStore.getState().auth
    expect(after.user).toBeNull()
    expect(after.accessToken).toBe('')
  })
})
