"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Zap } from "lucide-react";
import { safeReturnPath, type SessionUser } from "@/lib/auth-session";
import { SignInPage } from "@/components/ui/sign-in";
import { useSession } from "../use-session";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading, refresh } = useSession();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const returnTo = safeReturnPath(searchParams.get("return_to"));

  useEffect(() => {
    if (!loading && user) router.replace(returnTo);
  }, [loading, user, returnTo, router]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") || "").trim();
    const password = String(formData.get("password") || "");
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
    <SignInPage
      brand={
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-2xl bg-violet-500 text-white shadow-[0_8px_24px_rgb(113_106_255/35%)]">
            <Zap className="size-5 fill-current" />
          </span>
          <div>
            <div className="text-lg font-bold tracking-tight text-slate-900">Super FollowUP</div>
          </div>
        </div>
      }
      title={<span className="font-light tracking-tighter text-foreground">Welcome back</span>}
      description="Sign in with your OwnerDB account email and password."
      heroImageSrc="/login-hero.jpg"
      error={error}
      pending={pending}
      onSignIn={onSubmit}
    />
  );
}
