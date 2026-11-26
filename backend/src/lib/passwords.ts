import bcrypt from 'bcryptjs'

const BCRYPT_ROUNDS = 10

// bcrypt only reads the first 72 bytes, so longer passwords are rejected up front.
export const newPasswordSchema = {
  type: 'string',
  minLength: 8,
  maxLength: 72,
} as const

// Keeps login timing similar when the email is unknown.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_ROUNDS)

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS)
}

// Always runs a compare, even with no hash, so a missing user takes as long as a wrong password.
export function verifyPassword(
  password: string,
  hash: string | undefined
): Promise<boolean> {
  return bcrypt
    .compare(password, hash ?? DUMMY_HASH)
    .then((ok) => ok && hash !== undefined)
}
