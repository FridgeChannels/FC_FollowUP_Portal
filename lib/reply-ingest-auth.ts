import { getReplyIngestToken } from "./notion/config";

export function hasReplyIngestToken(request: Request) {
  const expected = getReplyIngestToken();
  if (!expected) return false;
  const header = request.headers.get("authorization") || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  return !!bearer && bearer === expected;
}
