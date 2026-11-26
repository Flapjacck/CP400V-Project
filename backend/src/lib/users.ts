import type { Queryable } from './db.js'

export type Role = 'user' | 'admin'

export type UserRow = {
  id: string
  email: string
  display_name: string
  bio: string
  role: Role
  created_at: Date
  password_hash?: string
}

// Never select password_hash unless the caller needs to check a password.
export const USER_COLUMNS = 'id, email, display_name, bio, role, created_at'

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
    createdAt: { type: 'string', format: 'date-time' },
  },
} as const

export function toUserJson(row: UserRow) {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    bio: row.bio,
    role: row.role,
    createdAt: row.created_at.toISOString(),
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

export async function updateUserProfile(
  db: Queryable,
  id: string,
  fields: { displayName?: string; bio?: string }
): Promise<UserRow | null> {
  const sets: string[] = []
  const params: unknown[] = []
  // Only fixed column names go into the SQL; values are always parameters.
  if (fields.displayName !== undefined) {
    params.push(fields.displayName)
    sets.push(`display_name = $${params.length}`)
  }
  if (fields.bio !== undefined) {
    params.push(fields.bio)
    sets.push(`bio = $${params.length}`)
  }
  if (sets.length === 0) return findUserById(db, id)
  params.push(id)
  const { rows } = await db.query(
    `UPDATE users SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING ${USER_COLUMNS}`,
    params
  )
  return (rows[0] as UserRow | undefined) ?? null
}
