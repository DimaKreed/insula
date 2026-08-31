import type { MetadataRoute } from 'next';

/**
 * PWA manifest. `display: standalone` is what makes an installed Insula exempt
 * from Safari's 7-day storage eviction, which is what keeps downloaded islands
 * available on a commute (Implementation Plan section 2.2).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Insula — your daily life, in Romanian',
    short_name: 'Insula',
    description:
      'Capture the sentences you actually say, learn them in Romanian: audio, shadowing and daily recall.',
    start_url: '/islands',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#f9f6ef',
    theme_color: '#2a3342',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
