import { createStorage } from '../lib/storage.js'

const KEY = 'smoke/check.txt'

async function main(): Promise<void> {
  const storage = createStorage()
  const payload = `smoke ${new Date().toISOString()}`

  try {
    await storage.putObject(KEY, payload, 'text/plain')
    const { stream } = await storage.getObjectStream(KEY)
    const chunks: Buffer[] = []
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    }
    const got = Buffer.concat(chunks).toString('utf8')
    if (got !== payload) {
      console.error('storage smoke: read back mismatch')
      process.exit(1)
    }
    await storage.deleteObject(KEY)
    console.log('storage smoke ok')
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`storage smoke failed: ${message}`)
    process.exit(1)
  } finally {
    storage.destroy()
  }
}

await main()