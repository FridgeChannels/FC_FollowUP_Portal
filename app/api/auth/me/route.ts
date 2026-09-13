import { readSessionFromRequest } from "@/lib/auth-session";
import { resolveSessionUser } from "@/lib/auth-user";

export async function GET(request: Request) {
  try {
    const session = readSessionFromRequest(request);
    if (!session) {
      return Response.json({ user: null }, { status: 401 });
    }

    const user = await resolveSessionUser(session.email);
    if (!user) {
      return Response.json({ user: null }, { status: 401 });
    }

    return Response.json({ user });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load session";
    return Response.json({ error: message }, { status: 500 });
  }
}
