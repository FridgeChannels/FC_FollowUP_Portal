export const SESSION_COOKIE = "fc_portal_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

export type PortalSession = {
  email: string;
};

export type SessionUser = {
  email: string;
  name: string | null;
  role: "Admin" | "FC_Owner" | "Caller";
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value?: string | null) {
  return value?.trim().toLowerCase() || "";
}

export function isValidEmail(value?: string | null) {
  const email = normalizeEmail(value);
  return EMAIL_PATTERN.test(email);
}

export function parseCookies(header: string | null) {
  const cookies: Record<string, string> = {};
  if (!header) return cookies;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) cookies[key] = value;
  }
  return cookies;
}

export function readSessionFromRequest(request: Request): PortalSession | null {
  const raw = parseCookies(request.headers.get("cookie"))[SESSION_COOKIE];
  if (!raw) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as PortalSession;
    const email = normalizeEmail(parsed.email);
    if (!isValidEmail(email)) return null;
    return { email };
  } catch {
    return null;
  }
}

export function sessionSetCookie(session: PortalSession, request: Request) {
  return cookieHeader(encodeURIComponent(JSON.stringify(session)), SESSION_MAX_AGE, request);
}

export function sessionClearCookie(request: Request) {
  return cookieHeader("", 0, request);
}

export function safeReturnPath(value?: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  if (value.startsWith("/login")) return "/";
  return value;
}

function cookieHeader(value: string, maxAge: number, request: Request) {
  const secure = new URL(request.url).protocol === "https:";
  return [
    `${SESSION_COOKIE}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
    secure ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}
