/** One string describing an island's sentence statuses, shared by the server
 * render and the client poller so a change is a plain string comparison. */
export interface StatusRow {
  id: string;
  status: string;
  hasAudio: boolean;
}

export function statusFingerprint(rows: StatusRow[]): string {
  return rows
    .map((row) => `${row.id}:${row.status}:${row.hasAudio ? 1 : 0}`)
    .join('|');
}
