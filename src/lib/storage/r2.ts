import {
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

import type {
  ConfigCheck,
  PutInput,
  PutResult,
  StorageProvider,
} from './provider';
import { assertConfigured } from './provider';

/**
 * Cloudflare R2 over its S3-compatible API — the deploy target (zero egress
 * fees, and audio is replayed on repeat, so bandwidth dominates cost).
 *
 * Not exercised while STORAGE_PROVIDER=local; it exists so switching to it is
 * an env change plus a one-off re-upload of `public/audio/`, with no call-site
 * edits anywhere.
 */
const REQUIRED = [
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET',
  'R2_PUBLIC_URL',
] as const;

let client: S3Client | undefined;

function s3(): S3Client {
  assertConfigured(r2);
  client ??= new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
  return client;
}

export const r2: StorageProvider = {
  name: 'r2',

  isConfigured(): ConfigCheck {
    const missing = REQUIRED.filter((key) => !process.env[key]);
    return missing.length === 0 ? { ok: true } : { ok: false, missing };
  },

  url(key: string): string {
    return `${process.env.R2_PUBLIC_URL!.replace(/\/$/, '')}/${key}`;
  },

  async exists(key: string): Promise<boolean> {
    try {
      await s3().send(
        new HeadObjectCommand({ Bucket: process.env.R2_BUCKET!, Key: key }),
      );
      return true;
    } catch {
      return false;
    }
  },

  async put({ key, body, contentType }: PutInput): Promise<PutResult> {
    await s3().send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET!,
        Key: key,
        Body: body,
        ContentType: contentType,
        // Content-addressed keys never change contents, so cache forever.
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
    return { key, url: r2.url(key) };
  },
};
