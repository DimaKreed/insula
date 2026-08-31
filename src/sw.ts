import { defaultCache } from '@serwist/next/worker';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import {
  CacheFirst,
  ExpirationPlugin,
  RangeRequestsPlugin,
  Serwist,
} from 'serwist';

/**
 * The service worker (Implementation Plan section 2.2). Built by @serwist/next
 * from this file into public/sw.js; typechecked by tsconfig.sw.json, which is
 * where the WebWorker lib lives.
 *
 * The one hand-written rule is audio: CacheFirst in its own bucket, because a
 * recording never changes (its URL is a content hash) and a commute has no
 * network. `RangeRequestsPlugin` is not optional — audio elements fetch with
 * `Range`, and Safari fails outright on a cached response that ignores it.
 *
 * Islands downloaded explicitly live in their own `island-{id}` caches, written
 * by `src/lib/offline.ts`; this rule is what makes casual listening stick too.
 */
declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      matcher: /\/audio\/[^/]+\.mp3$/i,
      handler: new CacheFirst({
        cacheName: 'audio-v1',
        plugins: [
          new RangeRequestsPlugin(),
          new ExpirationPlugin({
            maxEntries: 2000,
            maxAgeSeconds: 365 * 24 * 60 * 60,
          }),
        ],
      }),
    },
    ...defaultCache,
  ],
});

serwist.addEventListeners();
