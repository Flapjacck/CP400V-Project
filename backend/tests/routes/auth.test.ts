import { test, before } from 'node:test'
import assert from 'node:assert'
import bcrypt from 'bcryptjs'
import Fastify, { type FastifyInstance } from 'fastify'
import authPlugin from '../../src/plugins/auth.js'
import rateLimitPlugin from '../../src/plugins/rate-limit.js'
import signupRoute from '../../src/routes/auth/signup.js'
import loginRoute from '../../src/routes/auth/login.js'
import refreshRoute from '../../src/routes/auth/refresh.js'
import logoutRoute from '../../src/routes/auth/logout.js'
import { hashToken } from '../../src/lib/tokens.js'

const TEST_SECRET =
  'test-jwt-secret-at-least-32-characters-long-for-unit-tests'

const SEED_PASSWORD_HASH = bcrypt.hashSync('password123', 4)
const SEED_EMAIL = 'admin@example.com'
const SEED_USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

before(() => {
  process.env.JWT_SECRET = TEST_SECRET
})

type QueryCall = { text: string; params?: unknown[] }

function createFakeDb(
  options: {
    duplicateEmail?: boolean
    refreshLookupFails?: boolean
    missingUserOnRefresh?: boolean
  } = {}
) {
  const calls: QueryCall[] = []
  let sawRollback = false
  const validRefreshHashes = new Set<string>()
  const revokedRefreshHashes = new Set<string>()

  const queryImpl = async (text: string, params?: unknown[]) => {
    calls.push({ text, params })
    const t = text.trim()
    if (t === 'BEGIN' || t === 'COMMIT' || t === 'ROLLBACK') {
      if (t === 'ROLLBACK') sawRollback = true
      return { rows: [] }
    }
    if (text.includes('INSERT INTO users')) {
      if (options.duplicateEmail) {
        throw { code: '23505' }
      }
      return {
        rows: [
          {
            id: '11111111-1111-1111-1111-111111111111',
            email: params?.[0],
            display_name: params?.[2],
            bio: '',
            role: 'user',
            created_at: new Date('2025-01-01T00:00:00Z'),
          },
        ],
      }
    }
    if (text.includes('FROM users WHERE email')) {
      if (params?.[0] === SEED_EMAIL) {
        return {
          rows: [
            {
              id: SEED_USER_ID,
              email: SEED_EMAIL,
              password_hash: SEED_PASSWORD_HASH,
              display_name: 'Admin',
              bio: '',
              role: 'admin',
              created_at: new Date('2025-01-01T00:00:00Z'),
            },
          ],
        }
      }
      return { rows: [] }
    }
    if (
      text.includes('FROM users WHERE id') ||
      text.includes('FROM users\n         WHERE id')
    ) {
      if (options.missingUserOnRefresh) {
        return { rows: [] }
      }
      if (params?.[0] === SEED_USER_ID) {
        return {
          rows: [
            {
              id: SEED_USER_ID,
              email: SEED_EMAIL,
              display_name: 'Admin',
              bio: '',
              role: 'admin',
              created_at: new Date('2025-01-01T00:00:00Z'),
            },
          ],
        }
      }
      return { rows: [] }
    }
    if (text.includes('INSERT INTO refresh_tokens')) {
      const tokenHash = String(params?.[1] ?? '')
      validRefreshHashes.add(tokenHash)
      return { rows: [] }
    }
    if (text.includes('FROM refresh_tokens')) {
      if (options.refreshLookupFails) {
        return { rows: [] }
      }
      const tokenHash = String(params?.[0] ?? '')
      if (
        revokedRefreshHashes.has(tokenHash) ||
        !validRefreshHashes.has(tokenHash)
      ) {
        return { rows: [] }
      }
      return {
        rows: [
          {
            id: '22222222-2222-2222-2222-222222222222',
            userId: SEED_USER_ID,
          },
        ],
      }
    }
    if (text.includes('UPDATE refresh_tokens SET revoked_at')) {
      const tokenHash = String(params?.[0] ?? '')
      revokedRefreshHashes.add(tokenHash)
      validRefreshHashes.delete(tokenHash)
      return { rows: [] }
    }
    return { rows: [] }
  }

  const client = {
    query: queryImpl,
    release: () => {},
  }

  const db = {
    connect: async () => client,
    query: client.query,
    calls,
    get sawRollback() {
      return sawRollback
    },
  }
  return db
}

// Mirrors app.ts: the rate limiter is registered once, then each route file.
async function registerAuthRoutes(fastify: FastifyInstance) {
  await fastify.register(rateLimitPlugin)
  await fastify.register(signupRoute)
  await fastify.register(loginRoute)
  await fastify.register(refreshRoute)
  await fastify.register(logoutRoute)
}

async function injectSignup(
  body: Record<string, unknown>,
  db = createFakeDb()
) {
  const fastify = Fastify({
    logger: false,
    ajv: { customOptions: { removeAdditional: false } },
  })
  await fastify.register(authPlugin)
  fastify.decorate('db', db as never)
  await registerAuthRoutes(fastify)
  const res = await fastify.inject({
    method: 'POST',
    url: '/api/auth/signup',
    payload: body,
  })
  await fastify.close()
  return { res, db }
}

async function injectLogin(
  body: Record<string, unknown>,
  db = createFakeDb()
) {
  const fastify = Fastify({
    logger: false,
    ajv: { customOptions: { removeAdditional: false } },
  })
  await fastify.register(authPlugin)
  fastify.decorate('db', db as never)
  await registerAuthRoutes(fastify)
  const res = await fastify.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: body,
  })
  await fastify.close()
  return { res, db }
}

async function createAuthFastify(
  db = createFakeDb()
): Promise<{ fastify: FastifyInstance; db: ReturnType<typeof createFakeDb> }> {
  const fastify = Fastify({
    logger: false,
    ajv: { customOptions: { removeAdditional: false } },
  })
  await fastify.register(authPlugin)
  fastify.decorate('db', db as never)
  await registerAuthRoutes(fastify)
  return { fastify, db }
}

const validBody = {
  email: 'User@Example.com',
  password: 'password123',
  displayName: 'Test User',
}

const validLogin = {
  email: SEED_EMAIL,
  password: 'password123',
}

test('signup OK returns 201 with accessToken and user', async () => {
  const { res, db } = await injectSignup(validBody)
  assert.strictEqual(res.statusCode, 201)
  const body = res.json() as {
    accessToken: string
    user: Record<string, unknown>
  }
  assert.ok(body.accessToken.length > 0)
  assert.strictEqual(body.user.email, 'user@example.com')
  assert.strictEqual(body.user.displayName, 'Test User')
  assert.strictEqual(body.user.createdAt, '2025-01-01T00:00:00.000Z')
  assert.ok(!('password_hash' in body.user))

  const setCookie = res.headers['set-cookie']
  assert.ok(setCookie)
  const cookieStr = Array.isArray(setCookie) ? setCookie[0] : setCookie
  assert.match(cookieStr, /refresh_token=/)
  assert.match(cookieStr, /HttpOnly/i)
  assert.match(cookieStr, /SameSite=Strict/i)
  assert.match(cookieStr, /Path=\/api\/auth/)
  assert.doesNotMatch(cookieStr, /;\s*Secure/i)

  const refreshInsert = db.calls.find((c) =>
    c.text.includes('INSERT INTO refresh_tokens')
  )
  const userInsert = db.calls.find((c) => c.text.includes('INSERT INTO users'))
  assert.ok(refreshInsert?.params?.[1])
  assert.ok(userInsert?.params?.[1])
  const cookieValue = cookieStr.split(';')[0].split('=').slice(1).join('=')
  assert.notStrictEqual(refreshInsert.params[1], cookieValue)
  assert.match(String(userInsert.params[1]), /^\$2/)

  const jwtPart = body.accessToken.split('.')[1]
  const payload = JSON.parse(
    Buffer.from(jwtPart, 'base64url').toString('utf8')
  )
  assert.strictEqual(payload.sub, '11111111-1111-1111-1111-111111111111')
  assert.strictEqual(payload.role, 'user')
})

test('duplicate email returns 409 and rolls back', async () => {
  const db = createFakeDb({ duplicateEmail: true })
  const { res } = await injectSignup(validBody, db)
  assert.strictEqual(res.statusCode, 409)
  assert.deepStrictEqual(res.json(), { error: 'Email already in use' })
  assert.ok(db.sawRollback)
})

test('bad email returns 400', async () => {
  const { res } = await injectSignup({ ...validBody, email: 'not-email' })
  assert.strictEqual(res.statusCode, 400)
})

test('7-char password returns 400', async () => {
  const { res } = await injectSignup({ ...validBody, password: '1234567' })
  assert.strictEqual(res.statusCode, 400)
})

test('73-char password returns 400', async () => {
  const { res } = await injectSignup({
    ...validBody,
    password: 'a'.repeat(73),
  })
  assert.strictEqual(res.statusCode, 400)
})

test('blank display name returns 400', async () => {
  const { res } = await injectSignup({ ...validBody, displayName: '   ' })
  assert.strictEqual(res.statusCode, 400)
})

test('extra field returns 400 on signup', async () => {
  const { res } = await injectSignup({ ...validBody, extra: true })
  assert.strictEqual(res.statusCode, 400)
})

test('login OK returns 200 with accessToken and admin user', async () => {
  const { res, db } = await injectLogin(validLogin)
  assert.strictEqual(res.statusCode, 200)
  const body = res.json() as {
    accessToken: string
    user: Record<string, unknown>
  }
  assert.ok(body.accessToken.length > 0)
  assert.strictEqual(body.user.role, 'admin')
  assert.ok(!('password_hash' in body.user))

  const setCookie = res.headers['set-cookie']
  assert.ok(setCookie)
  const cookieStr = Array.isArray(setCookie) ? setCookie[0] : setCookie
  assert.match(cookieStr, /refresh_token=/)
  assert.match(cookieStr, /HttpOnly/i)
  assert.match(cookieStr, /SameSite=Strict/i)
  assert.match(cookieStr, /Path=\/api\/auth/)

  const refreshInsert = db.calls.find((c) =>
    c.text.includes('INSERT INTO refresh_tokens')
  )
  assert.ok(refreshInsert?.params?.[1])
  const cookieValue = cookieStr.split(';')[0].split('=').slice(1).join('=')
  assert.notStrictEqual(refreshInsert.params[1], cookieValue)
})

test('login normalizes email with spaces and mixed case', async () => {
  const { res } = await injectLogin({
    email: '  Admin@Example.com ',
    password: 'password123',
  })
  assert.strictEqual(res.statusCode, 200)
})

test('wrong password returns 401', async () => {
  const { res } = await injectLogin({
    email: SEED_EMAIL,
    password: 'wrong-password',
  })
  assert.strictEqual(res.statusCode, 401)
  assert.deepStrictEqual(res.json(), { error: 'Invalid email or password' })
})

test('unknown email returns same 401 body as wrong password', async () => {
  const { res: unknownRes } = await injectLogin({
    email: 'nobody@example.com',
    password: 'password123',
  })
  const { res: wrongRes } = await injectLogin({
    email: SEED_EMAIL,
    password: 'password123-wrong',
  })
  assert.strictEqual(unknownRes.statusCode, 401)
  assert.strictEqual(wrongRes.statusCode, 401)
  assert.deepStrictEqual(unknownRes.json(), wrongRes.json())
})

test('extra field returns 400 on login', async () => {
  const { res } = await injectLogin({ ...validLogin, extra: true })
  assert.strictEqual(res.statusCode, 400)
})

function cookieValueFromSetCookie(
  setCookie: string | string[] | undefined
): string | undefined {
  if (!setCookie) return undefined
  const cookieStr = Array.isArray(setCookie) ? setCookie[0] : setCookie
  return cookieStr.split(';')[0].split('=').slice(1).join('=')
}

async function loginAndGetRefreshCookie(
  db = createFakeDb()
): Promise<{
  refreshCookie: string
  db: ReturnType<typeof createFakeDb>
  fastify: FastifyInstance
}> {
  const { fastify, db: authDb } = await createAuthFastify(db)
  const loginRes = await fastify.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: validLogin,
  })
  assert.strictEqual(loginRes.statusCode, 200)
  const refreshCookie = cookieValueFromSetCookie(loginRes.headers['set-cookie'])
  assert.ok(refreshCookie)
  return { refreshCookie, db: authDb, fastify }
}

test('login rate limit returns 429 after 5 failed attempts', async () => {
  const { fastify } = await createAuthFastify()
  const bad = { email: SEED_EMAIL, password: 'bad' }
  for (let i = 0; i < 5; i++) {
    const res = await fastify.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: bad,
    })
    assert.strictEqual(res.statusCode, 401, `attempt ${i + 1}`)
  }
  const sixth = await fastify.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: bad,
  })
  assert.strictEqual(sixth.statusCode, 429)
  await fastify.close()
})

test('refresh with valid cookie returns 200 and admin role in JWT', async () => {
  const { fastify, refreshCookie } = await loginAndGetRefreshCookie()
  const res = await fastify.inject({
    method: 'POST',
    url: '/api/auth/refresh',
    cookies: { refresh_token: refreshCookie },
  })
  assert.strictEqual(res.statusCode, 200)
  const body = res.json() as {
    accessToken: string
    user: Record<string, unknown>
  }
  assert.ok(body.accessToken.length > 0)
  assert.strictEqual(body.user.role, 'admin')
  const jwtPart = body.accessToken.split('.')[1]
  const payload = JSON.parse(
    Buffer.from(jwtPart, 'base64url').toString('utf8')
  )
  assert.strictEqual(payload.role, 'admin')
  await fastify.close()
})

test('refresh with no cookie returns 401', async () => {
  const { fastify } = await createAuthFastify()
  const res = await fastify.inject({
    method: 'POST',
    url: '/api/auth/refresh',
  })
  assert.strictEqual(res.statusCode, 401)
  assert.deepStrictEqual(res.json(), { error: 'Unauthorized' })
  await fastify.close()
})

test('refresh with invalid or revoked token returns 401 and clears cookie', async () => {
  const db = createFakeDb({ refreshLookupFails: true })
  const { fastify, refreshCookie } = await loginAndGetRefreshCookie(db)
  const res = await fastify.inject({
    method: 'POST',
    url: '/api/auth/refresh',
    cookies: { refresh_token: refreshCookie },
  })
  assert.strictEqual(res.statusCode, 401)
  const cleared = res.headers['set-cookie']
  assert.ok(cleared)
  const cookieStr = Array.isArray(cleared) ? cleared[0] : cleared
  assert.match(cookieStr, /refresh_token=;/)
  await fastify.close()

  const { fastify: fastify2 } = await createAuthFastify()
  const unknown = await fastify2.inject({
    method: 'POST',
    url: '/api/auth/refresh',
    cookies: { refresh_token: 'not-a-stored-token' },
  })
  assert.strictEqual(unknown.statusCode, 401)
  await fastify2.close()
})

test('logout with cookie returns 204, revokes hash, and clears cookie', async () => {
  const { fastify, refreshCookie, db } = await loginAndGetRefreshCookie()
  const res = await fastify.inject({
    method: 'POST',
    url: '/api/auth/logout',
    cookies: { refresh_token: refreshCookie },
  })
  assert.strictEqual(res.statusCode, 204)
  assert.strictEqual(res.body, '')
  const cleared = res.headers['set-cookie']
  assert.ok(cleared)
  const revoke = db.calls.find((c) =>
    c.text.includes('UPDATE refresh_tokens SET revoked_at')
  )
  assert.ok(revoke)
  assert.strictEqual(revoke.params?.[0], hashToken(refreshCookie))
  await fastify.close()
})

test('logout with no cookie still returns 204', async () => {
  const { fastify } = await createAuthFastify()
  const res = await fastify.inject({
    method: 'POST',
    url: '/api/auth/logout',
  })
  assert.strictEqual(res.statusCode, 204)
  await fastify.close()
})

test('refresh after logout returns 401', async () => {
  const { fastify, refreshCookie } = await loginAndGetRefreshCookie()
  const logout = await fastify.inject({
    method: 'POST',
    url: '/api/auth/logout',
    cookies: { refresh_token: refreshCookie },
  })
  assert.strictEqual(logout.statusCode, 204)
  const res = await fastify.inject({
    method: 'POST',
    url: '/api/auth/refresh',
    cookies: { refresh_token: refreshCookie },
  })
  assert.strictEqual(res.statusCode, 401)
  await fastify.close()
})