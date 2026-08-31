/**
 * The app's single persistent HTMLAudioElement.
 *
 * One element for the whole app, created once and never replaced, with only its
 * `src` swapped: iOS keeps a *playing* element alive in the background but
 * treats a freshly created one as a new, un-gestured playback and refuses it.
 * No howler.js, no Web Audio — its iOS path actively breaks lock-screen
 * playback (Implementation Plan section 2.2).
 */
let element: HTMLAudioElement | undefined;

export function getAudioElement(): HTMLAudioElement {
  if (typeof window === 'undefined') {
    throw new Error('getAudioElement is browser-only');
  }
  if (!element) {
    element = new Audio();
    element.preload = 'auto';
  }
  return element;
}
