import { after } from 'next/server';

/**
 * The one seam background work goes through.
 *
 * Today it is `after()` from next/server: the work runs once the response has
 * been sent, so nobody waits on a spinner and no extra service has to run. A
 * queue (QStash) earns its place when retries, fan-out past the function
 * timeout and other users' load are real — none of which is true for a single
 * local user (Implementation Plan section 1). When it does, only this function
 * changes: call sites hand over a name and a closure and never learn which it
 * was.
 *
 * Consequences worth knowing while this is `after()`: the work is best-effort
 * (a crash loses it — the row stays non-terminal and the backfill script or the
 * per-row Retry picks it up), and it must be short enough for the platform's
 * function timeout.
 */
export function enqueue(name: string, work: () => Promise<void>): void {
  after(async () => {
    const started = Date.now();
    try {
      await work();
      console.log(`[job:${name}] done in ${Date.now() - started}ms`);
    } catch (error) {
      // Swallowed on purpose: the response is already sent, and every job marks
      // its own rows on failure. Logging is all that is left to do here.
      console.error(`[job:${name}] failed`, error);
    }
  });
}
