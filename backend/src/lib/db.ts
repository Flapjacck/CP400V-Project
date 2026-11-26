// Pool or transaction client: same query shape either way.
export interface Queryable {
  query: (
    text: string,
    params?: unknown[]
  ) => Promise<{ rows: Record<string, unknown>[] }>
}

// Postgres 23505 means a unique constraint blocked the insert (taken email, repeat like).
export function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: string }).code === '23505'
  )
}
