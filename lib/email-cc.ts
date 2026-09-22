/** Basic mailbox shape used when normalizing Email CC lists. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class EmailCcError extends Error {}

/**
 * Parse a comma-separated CC string into a normalized Notion `CC` value.
 * Returns null when empty (caller should omit the property).
 */
export function normalizeEmailCc(input?: string | null): string | null {
  if (input == null) return null;
  const raw = String(input).trim();
  if (!raw) return null;

  const seen = new Set<string>();
  const emails: string[] = [];
  for (const part of raw.split(",")) {
    const email = part.trim().toLowerCase();
    if (!email) continue;
    if (!EMAIL_PATTERN.test(email)) {
      throw new EmailCcError(`Invalid CC email: ${part.trim()}`);
    }
    if (seen.has(email)) continue;
    seen.add(email);
    emails.push(email);
  }
  return emails.length ? emails.join(",") : null;
}
