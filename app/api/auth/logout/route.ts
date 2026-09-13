import { sessionClearCookie } from "@/lib/auth-session";

export async function POST(request: Request) {
  return Response.json(
    { ok: true },
    {
      headers: {
        "Set-Cookie": sessionClearCookie(request),
      },
    },
  );
}
