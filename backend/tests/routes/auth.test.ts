import { test, before } from 'node:test'
import assert from 'node:assert'
import bcrypt from 'bcryptjs'
import Fastify, { type FastifyInstance } from 'fastify'
import authPlugin from '../../src/plugins/auth.js'
import authRoutes from '../../src/routes/auth.js'

const TEST_SECRET =
  'test-jwt-secret-at-least-32-characters-long-for-unit-tests'

const SEED_PASSWORD_HASH = bcrypt.hashSync('password123', 4)
const SEED_EMAIL = 'admin@example.com'
const SEED_USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

before(() => {
  process.env.JWT_SECRET = TEST_SECRET
})

type QueryCall = { text: string; params?: unknown[] }

function createFakeDb(options: { duplicateEmail?: boolean } = {}) {
  const calls: QueryCall[] = []
  let sawRollback = false

  const client = {
    query: async (text: string, params?: unknown[]) => {
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
              },
            ],
          }
        }
        return { rows: [] }
      }
      if (text.includes('INSERT INTO refresh_tokens')) {
        return { rows: [] }
      }
      return { rows: [] }
    },
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
  await fastify.register(authRoutes)
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
  await fastify.register(authRoutes)
  const res = await fastify.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: body,
  })
  await fastify.close()
  return { res, db }
}

async function createLoginFastify(
  db = createFakeDb()
): Promise<{ fastify: FastifyInstance; db: ReturnType<typeof createFakeDb> }> {
  const fastify = Fastify({
    logger: false,
    ajv: { customOptions: { removeAdditional: false } },
  })
  await fastify.register(authPlugin)
  fastify.decorate('db', db as never)
  await fastify.register(authRoutes)
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

test('login rate limit returns 429 after 5 failed attempts', async () => {
  const { fastify } = await createLoginFastify()
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