/** Drops anything scraped that isn't a plain web link, such as javascript: URLs. */
export function safeHttpUrl(value: unknown): string {
  if (typeof value !== "string") return "";
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

export function normalizeKey(...parts: string[]): string {
  return parts
    .map((part) =>
      part
        .toLowerCase()
        .replace(/\b(llc|l\.l\.c|fze|fzc|fz-llc|dmcc|ltd|limited|inc)\b/g, "")
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .trim(),
    )
    .join("|");
}
