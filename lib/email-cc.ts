/** Basic mailbox shape used when normalizing Email address lists. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ANGLE_EMAIL_PATTERN = /<([^<>\s@]+@[^<>\s@]+\.[^<>\s@]+)>/;

export class EmailCcError extends Error {}

function extractMailbox(part: string): string {
  const trimmed = part.trim();
  const angled = trimmed.match(ANGLE_EMAIL_PATTERN);
  return (angled?.[1] || trimmed).trim().toLowerCase();
}

/**
 * Parse comma- or semicolon-separated addresses into a normalized Notion value.
 * Accepts bare emails or `Name <email@domain>` forms.
 * Returns null when empty (caller should omit the property).
 * Output uses `;` as the separator (Notion ConversationDB convention).
 */
export function normalizeEmailAddressList(
  input?: string | null,
  fieldLabel = "email",
): string | null {
  if (input == null) return null;
  const raw = String(input).trim();
  if (!raw) return null;

  const seen = new Set<string>();
  const emails: string[] = [];
  for (const part of raw.split(/[;,]/)) {
    const email = extractMailbox(part);
    if (!email) continue;
    if (!EMAIL_PATTERN.test(email)) {
      throw new EmailCcError(`Invalid ${fieldLabel}: ${part.trim()}`);
    }
    if (seen.has(email)) continue;
    seen.add(email);
    emails.push(email);
  }
  return emails.length ? emails.join(";") : null;
}

/** Notion ConversationDB `CC` (semicolon-separated). */
export function normalizeEmailCc(input?: string | null): string | null {
  return normalizeEmailAddressList(input, "CC email");
}

/** Notion ConversationDB `Recipient` / email To (semicolon-separated). */
export function normalizeEmailRecipient(input?: string | null): string | null {
  return normalizeEmailAddressList(input, "Recipient email");
}
