import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type {
  ConfigCheck,
  PutInput,
  PutResult,
  StorageProvider,
} from './provider';

/**
 * The development default: audio lands in `public/audio/` and Next serves it as
 * a static file. Needs no account, which is the whole point while building.
 *
 * Deliberately not deploy-ready — Vercel's filesystem is read-only and
 * ephemeral, so `STORAGE_PROVIDER=r2` is mandatory before the first deploy
 * (Implementation Plan section 8).
 */
const PUBLIC_DIR = path.resolve('public');

export const local: StorageProvider = {
  name: 'local',

  isConfigured(): ConfigCheck {
    return { ok: true };
  },

  url(key: string): string {
    return `/${key}`;
  },

  async exists(key: string): Promise<boolean> {
    try {
      await access(path.join(PUBLIC_DIR, key));
      return true;
    } catch {
      return false;
    }
  },

  async put({ key, body }: PutInput): Promise<PutResult> {
    const file = path.join(PUBLIC_DIR, key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body);
    return { key, url: local.url(key) };
  },
};
