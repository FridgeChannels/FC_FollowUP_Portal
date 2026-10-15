"use client";

import React, { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

export interface Testimonial {
  avatarSrc: string;
  name: string;
  handle: string;
  text: string;
}

interface SignInPageProps {
  brand?: React.ReactNode;
  title?: React.ReactNode;
  description?: React.ReactNode;
  heroImageSrc?: string;
  testimonials?: Testimonial[];
  defaultEmail?: string;
  error?: React.ReactNode;
  pending?: boolean;
  onSignIn?: (event: React.FormEvent<HTMLFormElement>) => void;
  onGoogleSignIn?: () => void;
  onResetPassword?: () => void;
  onCreateAccount?: () => void;
}

const GoogleIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-2.641-.21-5.236-.611-7.743z" />
    <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
    <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
    <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l6.19 5.238C42.022 35.026 44 30.038 44 24c0-2.641-.21-5.236-.611-7.743z" />
  </svg>
);

const GlassInputWrapper = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-2xl border border-border bg-foreground/5 backdrop-blur-sm transition-colors focus-within:border-violet-400/70 focus-within:bg-violet-500/10">
    {children}
  </div>
);

const TestimonialCard = ({ testimonial, delay }: { testimonial: Testimonial; delay: string }) => (
  <div className={`animate-testimonial ${delay} flex w-64 items-start gap-3 rounded-3xl border border-white/10 bg-card/40 p-5 backdrop-blur-xl dark:bg-zinc-800/40`}>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={testimonial.avatarSrc} className="h-10 w-10 rounded-2xl object-cover" alt="" />
    <div className="text-sm leading-snug">
      <p className="flex items-center gap-1 font-medium">{testimonial.name}</p>
      <p className="text-muted-foreground">{testimonial.handle}</p>
      <p className="mt-1 text-foreground/80">{testimonial.text}</p>
    </div>
  </div>
);

export const SignInPage: React.FC<SignInPageProps> = ({
  brand,
  title = <span className="font-light tracking-tighter text-foreground">Welcome</span>,
  description = "Access your account and continue your journey with us",
  heroImageSrc,
  testimonials = [],
  defaultEmail,
  error,
  pending = false,
  onSignIn,
  onGoogleSignIn,
  onResetPassword,
  onCreateAccount,
}) => {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="relative isolate flex min-h-[100dvh] w-full flex-col overflow-hidden bg-background font-sans text-foreground md:flex-row">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(81,70,229,0.16),transparent_42%),radial-gradient(circle_at_bottom_right,rgba(17,19,26,0.08),transparent_36%)]" />

      <section className="relative flex min-h-[100dvh] flex-1 items-center justify-center px-5 py-10 sm:px-8 lg:min-w-[500px]">
        <div className="w-full max-w-md">
          {brand ? <div className="animate-element animate-delay-100 mb-8">{brand}</div> : null}
          <div className="flex flex-col gap-6">
            <div className="animate-element animate-delay-100">
              <h1 className="text-4xl font-semibold leading-tight md:text-5xl">{title}</h1>
              <p className="mt-3 text-muted-foreground">{description}</p>
            </div>

            <form className="space-y-5" onSubmit={onSignIn}>
              <div className="animate-element animate-delay-200">
                <label className="text-sm font-medium text-muted-foreground" htmlFor="sign-in-email">Email address</label>
                <GlassInputWrapper>
                  <input
                    id="sign-in-email"
                    name="email"
                    type="email"
                    autoComplete="username"
                    autoFocus
                    placeholder="Enter your email address"
                    defaultValue={defaultEmail}
                    className="w-full rounded-2xl bg-transparent p-4 text-sm text-foreground outline-none placeholder:text-muted-foreground"
                    required
                  />
                </GlassInputWrapper>
              </div>

              <div className="animate-element animate-delay-300">
                <label className="text-sm font-medium text-muted-foreground" htmlFor="sign-in-password">Password</label>
                <GlassInputWrapper>
                  <div className="relative">
                    <input
                      id="sign-in-password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      placeholder="Enter your password"
                      className="w-full rounded-2xl bg-transparent p-4 pr-12 text-sm text-foreground outline-none placeholder:text-muted-foreground"
                      required
                    />
                    <button
                      type="button"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      onClick={() => setShowPassword((value) => !value)}
                      className="absolute inset-y-0 right-3 flex items-center text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </GlassInputWrapper>
              </div>

              <div className="animate-element animate-delay-400 flex items-center justify-between gap-4 text-sm">
                <label className="flex cursor-pointer items-center gap-3 text-foreground/90">
                  <input type="checkbox" name="rememberMe" className="h-4 w-4 accent-violet-500" />
                  <span>Keep me signed in</span>
                </label>
                {onResetPassword ? (
                  <button type="button" onClick={onResetPassword} className="text-violet-500 transition-colors hover:underline">
                    Reset password
                  </button>
                ) : null}
              </div>

              {error ? <div className="animate-element text-sm text-destructive" role="alert">{error}</div> : null}

              <button
                type="submit"
                disabled={pending}
                className="animate-element animate-delay-500 w-full rounded-2xl bg-blue-700 py-4 font-medium text-white transition-colors hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pending ? "Signing in…" : "Sign in"}
              </button>
            </form>

            {onGoogleSignIn ? (
              <>
                <div className="animate-element animate-delay-600 relative flex items-center justify-center">
                  <span className="w-full border-t border-border" />
                  <span className="absolute bg-background px-4 text-sm text-muted-foreground">Or continue with</span>
                </div>
                <button onClick={onGoogleSignIn} type="button" className="animate-element animate-delay-700 flex w-full items-center justify-center gap-3 rounded-2xl border border-border py-4 transition-colors hover:bg-secondary">
                  <GoogleIcon />
                  Continue with Google
                </button>
              </>
            ) : null}

            {onCreateAccount ? (
              <p className="animate-element animate-delay-800 text-center text-sm text-muted-foreground">
                New to our platform? <button type="button" onClick={onCreateAccount} className="text-violet-500 transition-colors hover:underline">Create account</button>
              </p>
            ) : null}
          </div>
        </div>
      </section>

      {heroImageSrc ? (
        <section className="relative hidden flex-1 p-4 md:block">
          <div className="animate-slide-right animate-delay-300 absolute inset-4 overflow-hidden rounded-3xl bg-cover bg-center" style={{ backgroundImage: `linear-gradient(135deg, rgba(19, 15, 50, 0.18), rgba(81, 70, 229, 0.32)), url(${heroImageSrc})` }} />
          {testimonials.length > 0 ? (
            <div className="absolute bottom-8 left-1/2 flex w-full -translate-x-1/2 justify-center gap-4 px-8">
              <TestimonialCard testimonial={testimonials[0]} delay="animate-delay-900" />
              {testimonials[1] ? <div className="hidden xl:flex"><TestimonialCard testimonial={testimonials[1]} delay="animate-delay-1000" /></div> : null}
              {testimonials[2] ? <div className="hidden 2xl:flex"><TestimonialCard testimonial={testimonials[2]} delay="animate-delay-1100" /></div> : null}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
};
