import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  MAX_MEDIA_BYTES,
  contentAddressedKey,
  publicMediaPath,
  resetS3ClientForTests,
  sniffImageType,
} from './mediaStorage.js';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(4)]);
const WORKSPACE_ID = '22222222-2222-4222-8222-222222222222';

describe('mediaStorage', () => {
  beforeEach(() => {
    resetS3ClientForTests();
    delete process.env.S3_PUBLIC_BASE_URL;
  });

  afterEach(() => {
    resetS3ClientForTests();
    delete process.env.S3_PUBLIC_BASE_URL;
  });

  it('sniffs PNG, JPEG, and WebP magic bytes only', () => {
    expect(sniffImageType(PNG)).toBe('image/png');
    expect(sniffImageType(JPEG)).toBe('image/jpeg');
    expect(sniffImageType(WEBP)).toBe('image/webp');
    expect(sniffImageType(Buffer.from('GIF89a'))).toBeNull();
    expect(sniffImageType(Buffer.alloc(0))).toBeNull();
  });

  it('builds content-addressed keys under the workspace club prefix', () => {
    const digest = createHash('sha256').update(PNG).digest('hex');
    expect(contentAddressedKey(WORKSPACE_ID, 'logo', PNG, 'image/png'))
      .toBe(`clubs/${WORKSPACE_ID}/logo-${digest}.png`);
    expect(MAX_MEDIA_BYTES).toBe(5 * 1024 * 1024);
  });

  it('prefers the public base URL and falls back to the API media path', () => {
    const key = `clubs/${WORKSPACE_ID}/logo-abc.png`;
    expect(publicMediaPath(WORKSPACE_ID, key))
      .toBe(`/api/v1/media/clubs/${WORKSPACE_ID}/logo-abc.png`);
    process.env.S3_PUBLIC_BASE_URL = 'https://cdn.example.com/';
    expect(publicMediaPath(WORKSPACE_ID, key)).toBe(`https://cdn.example.com/${key}`);
  });
});
