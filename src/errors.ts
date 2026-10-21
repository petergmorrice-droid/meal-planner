/** The message of whatever was thrown (an Error, almost always), if it has one. */
export const messageOf = (err: unknown): string | undefined =>
  (err as { message?: string } | null | undefined)?.message;

/** The name of whatever was thrown ("AbortError" when the share sheet is closed), if it has one. */
export const errorNameOf = (err: unknown): string | undefined => (err as { name?: string } | null | undefined)?.name;
