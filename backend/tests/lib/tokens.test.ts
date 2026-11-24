import { test } from 'node:test'
import assert from 'node:assert'
import { hashToken, newRefreshToken } from '../../src/lib/tokens.js'

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