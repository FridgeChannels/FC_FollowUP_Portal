"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { safeReturnPath, type SessionUser } from "@/lib/auth-session";
import { useSession } from "../use-session";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading, refresh } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const returnTo = safeReturnPath(searchParams.get("return_to"));

  useEffect(() => {
    if (!loading && user) router.replace(returnTo);
  }, [loading, user, returnTo, router]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const payload = (await response.json()) as { user?: SessionUser; error?: string };
      if (!response.ok || !payload.user) {
        throw new Error(payload.error || "Unable to sign in");
      }
      await refresh();
      router.replace(returnTo);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign in");
      setPending(false);
    }
  }

  if (loading || user) {
    return (
      <div className="grid min-h-svh place-items-center bg-[#f7f8fc] text-sm text-slate-500">
        Checking session…
      </div>
    );
  }

  return (
    <div className="relative min-h-svh overflow-hidden bg-[#f7f8fc]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(81,70,229,0.16),transparent_42%),radial-gradient(circle_at_bottom_right,rgba(17,19,26,0.08),transparent_36%)]" />
      <div className="relative grid min-h-svh place-items-center px-4 py-10">
        <div className="w-full max-w-[420px]">
          <div className="mb-8 flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-2xl bg-violet-500 text-white shadow-[0_8px_24px_rgb(113_106_255/35%)]">
              <Zap className="size-5 fill-current" />
            </span>
            <div>
              <div className="text-lg font-bold tracking-tight text-slate-900">Super FollowUP</div>
              <div className="text-sm text-slate-500">FC Operations</div>
            </div>
          </div>
          <Card className="border-slate-200/80 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
            <CardHeader className="gap-1">
              <CardTitle className="text-xl">Sign in</CardTitle>
              <CardDescription>
                Sign in with your OwnerDB account email and password.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={onSubmit}>
                <div className="space-y-2">
                  <Label htmlFor="email">Work email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="username"
                    autoFocus
                    placeholder="you@fridgeteam.com"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                  />
                </div>
                {error ? (
                  <p className="text-sm text-destructive" role="alert">
                    {error}
                  </p>
                ) : null}
                <Button className="h-10 w-full" disabled={pending} type="submit">
                  {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                  {pending ? "Signing in…" : "Sign in"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
