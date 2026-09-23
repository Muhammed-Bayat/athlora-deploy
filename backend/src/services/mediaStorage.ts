import { createHash } from 'node:crypto';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

export const MAX_MEDIA_BYTES = 5 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

export interface StoredMedia {
  key: string;
  contentType: AllowedImageType;
  byteSize: number;
}

const extensionByType: Record<AllowedImageType, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

let client: S3Client | undefined;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for media storage`);
  return value;
}

export function getS3Client(): S3Client {
  if (client) return client;
  client = new S3Client({
    region: process.env.S3_REGION ?? 'auto',
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: Boolean(process.env.S3_ENDPOINT),
    credentials: {
      accessKeyId: requireEnv('S3_ACCESS_KEY_ID'),
      secretAccessKey: requireEnv('S3_SECRET_ACCESS_KEY'),
    },
  });
  return client;
}

export function resetS3ClientForTests(): void {
  client = undefined;
}

function bucket(): string {
  return requireEnv('S3_BUCKET');
}

export function sniffImageType(buffer: Buffer): AllowedImageType | null {
  if (buffer.length >= 8
    && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47
    && buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a) {
    return 'image/png';
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (buffer.length >= 12
    && buffer.toString('ascii', 0, 4) === 'RIFF'
    && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  return null;
}

export function contentAddressedKey(workspaceId: string, kind: 'logo' | 'cover', buffer: Buffer, contentType: AllowedImageType): string {
  const digest = createHash('sha256').update(buffer).digest('hex');
  return `clubs/${workspaceId}/${kind}-${digest}.${extensionByType[contentType]}`;
}

export async function putObject(key: string, body: Buffer, contentType: string): Promise<void> {
  await getS3Client().send(new PutObjectCommand({
    Bucket: bucket(),
    Key: key,
    Body: body,
    ContentType: contentType,
    CacheControl: 'public, max-age=31536000, immutable',
  }));
}

export async function deleteObject(key: string): Promise<void> {
  try {
    await getS3Client().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
  } catch {
    // Best-effort cleanup; orphaned objects remain content-addressed and unreachable.
  }
}

export async function getObject(key: string): Promise<{ body: Buffer; contentType: string; cacheControl: string }> {
  const result = await getS3Client().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
  if (!result.Body) throw new Error('Media object has no body');
  const bytes = await result.Body.transformToByteArray();
  return {
    body: Buffer.from(bytes),
    contentType: result.ContentType ?? 'application/octet-stream',
    cacheControl: result.CacheControl ?? 'public, max-age=31536000, immutable',
  };
}

export function publicMediaPath(workspaceId: string, key: string): string {
  const publicBase = process.env.S3_PUBLIC_BASE_URL?.replace(/\/$/, '');
  const filename = key.split('/').pop() ?? key;
  if (publicBase) return `${publicBase}/${key}`;
  return `/api/v1/media/clubs/${workspaceId}/${filename}`;
}

export async function storeBrandImage(
  workspaceId: string,
  kind: 'logo' | 'cover',
  buffer: Buffer,
): Promise<StoredMedia> {
  if (buffer.length === 0 || buffer.length > MAX_MEDIA_BYTES) {
    throw new Error('Media size is out of range');
  }
  const contentType = sniffImageType(buffer);
  if (!contentType) throw new Error('Unsupported media type');
  const key = contentAddressedKey(workspaceId, kind, buffer, contentType);
  await putObject(key, buffer, contentType);
  return { key, contentType, byteSize: buffer.length };
}
