import { userResponseSchema } from './users.js'

// Every error body is { error: string }.
export const errorSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    error: { type: 'string' },
  },
} as const

// Response schema blocks password_hash from ever showing up in JSON.
export const authResponseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    accessToken: { type: 'string' },
    user: userResponseSchema,
  },
} as const
