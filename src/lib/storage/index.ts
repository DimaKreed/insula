import { local } from './local';
import { r2 } from './r2';
import type { StorageProvider, StorageProviderName } from './provider';

export const storageProviders: Record<StorageProviderName, StorageProvider> = {
  local,
  r2,
};

/**
 * The store audio is written to, selected by STORAGE_PROVIDER. Defaults to
 * `local` so a fresh checkout needs no object-storage account.
 */
export function getStorage(name?: StorageProviderName): StorageProvider {
  const selected =
    name ??
    (process.env.STORAGE_PROVIDER as StorageProviderName | undefined) ??
    'local';
  const provider = storageProviders[selected];
  if (!provider) {
    throw new Error(`Unknown STORAGE_PROVIDER "${selected}" — use local | r2`);
  }
  return provider;
}

export * from './provider';
