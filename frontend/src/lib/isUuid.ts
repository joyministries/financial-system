/** Matches a UUID-shaped string (the DB row primary key format). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * True when the value looks like a database row UUID rather than a real
 * free-text ID (national ID / badge). Guardian records were historically
 * contaminated with row UUIDs stored in the `guardian_id` column; callers
 * use this to avoid rendering those as "ID: ..." in tables.
 */
export const isUuid = (v: string | null | undefined): boolean =>
  !!v && UUID_RE.test(v);
