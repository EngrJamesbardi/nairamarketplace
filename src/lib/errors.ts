/** Map database / PostgREST errors to user-safe messages without leaking internals. */
export function friendlyError(err: { message?: string; code?: string } | null | undefined, fallback = "Something went wrong. Please try again."): string {
  if (!err) return fallback;
  const code = err.code ?? "";
  const msg = err.message ?? "";
  // Our own RAISE EXCEPTION messages are written for users; pass them through for known codes.
  if (["P0001", "P0002", "P0409", "P0429", "22023", "23514", "42501", "23505"].includes(code) && msg && !/violates|relation|column|function/i.test(msg)) {
    return msg;
  }
  if (code === "23505") return "That already exists.";
  if (code === "42501") return "You do not have permission to do that.";
  if (code === "23514") return "Some details are not valid.";
  return fallback;
}
