import { test } from 'node:test'
import assert from 'node:assert'
import { isUniqueViolation } from '../../src/lib/db.js'
import { requireEnv } from '../../src/lib/env.js'
import { hashPassword, verifyPassword } from '../../src/lib/passwords.js'
import { toUserJson } from '../../src/lib/users.js'

test('requireEnv returns the value or throws with the name', () => {
  process.env.TEST_REQUIRE_ENV = 'x'
  assert.strictEqual(requireEnv('TEST_REQUIRE_ENV'), 'x')
  delete process.env.TEST_REQUIRE_ENV
  assert.throws(() => requireEnv('TEST_REQUIRE_ENV'), /Missing env: TEST_REQUIRE_ENV/)
})

test('isUniqueViolation only matches Postgres 23505', () => {
  assert.strictEqual(isUniqueViolation({ code: '23505' }), true)
  assert.strictEqual(isUniqueViolation({ code: '23503' }), false)
  assert.strictEqual(isUniqueViolation(new Error('nope')), false)
  assert.strictEqual(isUniqueViolation(null), false)
})

test('toUserJson never includes password_hash', () => {
  const json = toUserJson({
    id: 'u1',
    email: 'a@b.com',
    display_name: 'A',
    bio: '',
    role: 'user',
    password_hash: 'secret',
  })
  assert.deepStrictEqual(json, {
    id: 'u1',
    email: 'a@b.com',
    displayName: 'A',
    bio: '',
    role: 'user',
  })
})

test('verifyPassword is false with no hash and true for a match', async () => {
  const hash = await hashPassword('password123')
  assert.strictEqual(await verifyPassword('password123', hash), true)
  assert.strictEqual(await verifyPassword('wrong-pass', hash), false)
  assert.strictEqual(await verifyPassword('password123', undefined), false)
})
