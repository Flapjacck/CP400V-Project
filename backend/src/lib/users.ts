import type { Queryable } from './db.js'

export type Role = 'user' | 'admin'

export type UserRow = {
  id: string
  email: string
  display_name: string
  bio: string
  role: Role
  password_hash?: string
}

// Never select password_hash unless the caller needs to check a password.
export const USER_COLUMNS = 'id, email, display_name, bio, role'

// The owner's view of a user. Public profiles must leave out email and role.
export const userResponseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    email: { type: 'string' },
    displayName: { type: 'string' },
    bio: { type: 'string' },
    role: { type: 'string', enum: ['user', 'admin'] },
  },
} as const

export function toUserJson(row: UserRow) {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    bio: row.bio,
    role: row.role,
  }
}

export async function findUserById(
  db: Queryable,
  id: string
): Promise<UserRow | null> {
  const { rows } = await db.query(
    `SELECT ${USER_COLUMNS} FROM users WHERE id = $1`,
    [id]
  )
  return (rows[0] as UserRow | undefined) ?? null
}
