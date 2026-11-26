import { test } from 'node:test'
import assert from 'node:assert'
import {
  hashToken,
  newRefreshToken,
  revokeAllRefreshTokens,
} from '../../src/lib/tokens.js'

test('hashToken is 64 hex chars and deterministic', () => {
  const raw = 'test-refresh-token'
  const h1 = hashToken(raw)
  const h2 = hashToken(raw)
  assert.strictEqual(h1.length, 64)
  assert.match(h1, /^[0-9a-f]+$/)
  assert.strictEqual(h1, h2)
})

test('newRefreshToken returns distinct values', () => {
  const a = newRefreshToken()
  const b = newRefreshToken()
  assert.notStrictEqual(a, b)
  assert.ok(a.length > 0)
  assert.ok(b.length > 0)
})

test('revokeAllRefreshTokens revokes by user_id', async () => {
  const calls: { text: string; params?: unknown[] }[] = []
  const db = {
    query: async (text: string, params?: unknown[]) => {
      calls.push({ text, params })
      return { rows: [] }
    },
  }
  const userId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  await revokeAllRefreshTokens(db, userId)
  assert.strictEqual(calls.length, 1)
  assert.ok(calls[0].text.includes('UPDATE refresh_tokens'))
  assert.ok(calls[0].text.includes('user_id'))
  assert.ok(calls[0].text.includes('revoked_at IS NULL'))
  assert.deepStrictEqual(calls[0].params, [userId])
})
