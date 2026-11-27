import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import type { Readable } from 'node:stream'
import { requireEnv } from './env.js'

export type StorageConfig = {
  endpoint: string
  bucket: string
  region: string
  accessKeyId: string
  secretAccessKey: string
}

export type ObjectStreamResult = {
  stream: Readable
  contentType: string
  contentLength: number | undefined
  contentRange: string | undefined
}

export function storageConfigFromEnv(): StorageConfig {
  return {
    endpoint: requireEnv('S3_ENDPOINT'),
    bucket: requireEnv('S3_BUCKET'),
    region: requireEnv('S3_REGION'),
    accessKeyId: requireEnv('S3_ACCESS_KEY'),
    secretAccessKey: requireEnv('S3_SECRET_KEY'),
  }
}

export class Storage {
  private client: S3Client
  readonly bucket: string

  constructor(config: StorageConfig) {
    this.bucket = config.bucket
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    })
  }

  async bucketExists(): Promise<void> {
    await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }))
  }

  async putObject(
    key: string,
    body: string | Uint8Array | Buffer,
    contentType: string
  ): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      })
    )
  }

  async uploadObject(
    key: string,
    body: Readable,
    contentType: string
  ): Promise<void> {
    // Upload streams multipart data so audio is never collected in application memory.
    await new Upload({
      client: this.client,
      params: {
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      },
    }).done()
  }

  async getObjectStream(
    key: string,
    range?: string
  ): Promise<ObjectStreamResult> {
    const res = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Range: range,
      })
    )
    if (!res.Body) {
      throw new Error(`Empty body for key: ${key}`)
    }
    return {
      stream: res.Body as Readable,
      contentType: res.ContentType ?? 'application/octet-stream',
      contentLength: res.ContentLength,
      contentRange: res.ContentRange,
    }
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key })
    )
  }

  destroy(): void {
    this.client.destroy()
  }
}

export function createStorage(): Storage {
  return new Storage(storageConfigFromEnv())
}
