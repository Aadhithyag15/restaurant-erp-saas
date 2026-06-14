/** Only allow internal redirect targets — never user-supplied absolute URLs. */
export function safeNext(next: unknown): string | null {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : null;
}
