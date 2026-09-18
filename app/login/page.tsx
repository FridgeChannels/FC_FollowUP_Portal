import { Suspense } from "react";
import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to Super FollowUP with your work email and password.",
};

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="grid min-h-svh place-items-center bg-[#f7f8fc] text-sm text-slate-500">
          Loading…
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
