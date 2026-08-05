/** Normalize thrown values (Error, Postgrest-like objects, strings) for toasts/UI. */
export function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object") {
    const e = error as {
      message?: unknown;
      details?: unknown;
      hint?: unknown;
    };
    const parts = [e.message, e.details, e.hint].filter(
      (part): part is string => typeof part === "string" && part.trim().length > 0,
    );
    if (parts.length > 0) return parts.join(" — ");
  }
  return fallback;
}
