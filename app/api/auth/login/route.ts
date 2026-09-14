import { verifyPassword } from "@/lib/auth-password";
import { isValidEmail, sessionSetCookie } from "@/lib/auth-session";
import { resolveSessionUser } from "@/lib/auth-user";
import { findOwnerLoginByAccount, updateOwnerPasswordHash } from "@/lib/notion/owners";

const INVALID_CREDENTIALS = "Invalid email or password";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as {
      email?: string;
      password?: string;
    } | null;
    const email = body?.email?.trim() || "";
    const password = body?.password ?? "";
    if (!isValidEmail(email) || !password) {
      return Response.json({ error: "Enter your work email and password" }, { status: 400 });
    }

    const owner = await findOwnerLoginByAccount(email);
    if (!owner || owner.status !== "Active") {
      return Response.json({ error: INVALID_CREDENTIALS }, { status: 401 });
    }
    if (!owner.passwordHash) {
      return Response.json(
        { error: "Set Password Hash in OwnerDB before signing in" },
        { status: 403 },
      );
    }

    const verified = await verifyPassword(password, owner.passwordHash);
    if (!verified.ok) {
      return Response.json({ error: INVALID_CREDENTIALS }, { status: 401 });
    }
    if (verified.upgradedHash) {
      await updateOwnerPasswordHash(owner.id, verified.upgradedHash).catch(() => undefined);
    }

    const user = await resolveSessionUser(email);
    if (!user) {
      return Response.json({ error: INVALID_CREDENTIALS }, { status: 401 });
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
