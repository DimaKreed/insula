import { serwist } from '@serwist/next/config';

/**
 * Service-worker build config, consumed by `serwist build` (see the `build`
 * script in package.json). This is Serwist's "configurator mode".
 *
 * Why not the webpack plugin: @serwist/next's InjectManifest plugin runs a child
 * compilation inside Next 15.5's build and drops `pages/_error` from
 * .next/build-manifest.json, which leaves every production route returning a
 * bare 500. Configurator mode never touches the Next build — it reads the
 * finished .next output and bundles src/sw.ts with esbuild afterwards — so the
 * app builds exactly as it does without a service worker.
 *
 * `serwist()` fills in the glob patterns for Next's output, including
 * prerendered HTML, so only the paths below need naming.
 */
export default await serwist({
  swSrc: 'src/sw.ts',
  swDest: 'public/sw.js',
  // public/audio/ is the local storage provider's output — 16 MB and growing.
  // It is cached on demand by the audio rule in src/sw.ts and, deliberately,
  // by "download island"; precaching it on install would be neither.
  globIgnores: ['public/audio/**'],
});
