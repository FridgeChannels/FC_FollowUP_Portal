import { isValidEmail, sessionSetCookie } from "@/lib/auth-session";
import { resolveSessionUser } from "@/lib/auth-user";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as { email?: string } | null;
    const email = body?.email?.trim() || "";
    if (!isValidEmail(email)) {
      return Response.json({ error: "Enter a valid work email" }, { status: 400 });
    }

    const user = await resolveSessionUser(email);
    if (!user) {
      return Response.json(
        { error: "This email is not an Active Owner account" },
        { status: 403 },
      );
    }

    return Response.json(
      { user },
      {
        headers: {
          "Set-Cookie": sessionSetCookie({ email: user.email }, request),
        },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to sign in";
    return Response.json({ error: message }, { status: 500 });
  }
}
