import type { NextConfig } from 'next';

/**
 * No service-worker plugin here on purpose: Serwist runs in configurator mode,
 * as a separate `serwist build` step after `next build` (see serwist.config.mjs
 * for why). The Next build stays plain.
 */
const nextConfig: NextConfig = {};

export default nextConfig;
