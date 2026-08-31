/** What every server action returns: a value, or a message the UI can show. */
export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export const done: ActionResult = { ok: true, data: undefined };

export function failed(error: string): ActionResult<never> {
  return { ok: false, error };
}
