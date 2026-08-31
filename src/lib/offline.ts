/**
 * Explicit offline download for an island (Implementation Plan section 2.2).
 *
 * Browser-only. Both the manifest and the audio live in one Cache Storage
 * bucket per island, so there is no second store to keep in sync: the presence
 * of the manifest in `island-{id}` *is* the record that the island was
 * downloaded, and the service worker serves the same entries on a commute with
 * no signal. `navigator.storage.persist()` asks the browser not to evict it.
 */

export interface PlaylistItem {
  sentenceId: string;
  sourceText: string;
  targetText: string;
  audioUrl: string;
  durationMs: number | null;
}

export interface Manifest {
  islandId: string;
  name: string;
  emoji: string | null;
  targetLang: string;
  items: PlaylistItem[];
}

export interface OfflineState {
  downloaded: boolean;
  /** Audio files present in the cache, and how many the island has. */
  cached: number;
  total: number;
}

const cacheName = (islandId: string) => `island-${islandId}`;
const manifestUrl = (islandId: string) => `/api/islands/${islandId}/playlist`;

export function offlineSupported(): boolean {
  return typeof window !== 'undefined' && 'caches' in window;
}

async function cachedManifest(
  cache: Cache,
  islandId: string,
): Promise<Manifest | null> {
  const response = await cache.match(manifestUrl(islandId));
  if (!response) return null;
  try {
    return (await response.json()) as Manifest;
  } catch {
    return null;
  }
}

export async function offlineState(islandId: string): Promise<OfflineState> {
  const empty = { downloaded: false, cached: 0, total: 0 };
  if (!offlineSupported()) return empty;
  if (!(await caches.has(cacheName(islandId)))) return empty;

  const cache = await caches.open(cacheName(islandId));
  const manifest = await cachedManifest(cache, islandId);
  if (!manifest) return empty;

  const keys = new Set(
    (await cache.keys()).map((request) => new URL(request.url).pathname),
  );
  const cached = manifest.items.filter((item) =>
    keys.has(new URL(item.audioUrl, location.origin).pathname),
  ).length;

  return { downloaded: true, cached, total: manifest.items.length };
}

/**
 * Fetches the manifest and stores it with every audio file it names. Safe to
 * re-run: `put`/`addAll` overwrite by URL, so a second run just tops up the
 * audio added since the first.
 */
export async function downloadIsland(
  islandId: string,
): Promise<OfflineState> {
  if (!offlineSupported()) {
    throw new Error('This browser cannot store audio for offline use.');
  }

  const response = await fetch(manifestUrl(islandId), { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Could not load the playlist (HTTP ${response.status}).`);
  }
  const manifest = (await response.clone().json()) as Manifest;
  if (manifest.items.length === 0) {
    throw new Error('This island has no audio yet.');
  }

  const cache = await caches.open(cacheName(islandId));
  await cache.put(manifestUrl(islandId), response);
  await cache.addAll(manifest.items.map((item) => item.audioUrl));

  // Installed PWAs are exempt from Safari's 7-day eviction; this adds the same
  // protection in browsers that grant it.
  await navigator.storage?.persist?.().catch?.(() => false);

  return offlineState(islandId);
}

export async function removeIsland(islandId: string): Promise<void> {
  if (!offlineSupported()) return;
  await caches.delete(cacheName(islandId));
}

/**
 * The manifest as stored offline — what the player falls back to when the
 * network is gone and the server component could not render.
 */
export async function offlineManifest(
  islandId: string,
): Promise<Manifest | null> {
  if (!offlineSupported()) return null;
  if (!(await caches.has(cacheName(islandId)))) return null;
  return cachedManifest(await caches.open(cacheName(islandId)), islandId);
}
