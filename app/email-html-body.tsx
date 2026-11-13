"use client";

import { isSafeDisplayImageUrl, looksLikeEmailHtml, sanitizeEmailHtml } from "@/lib/email-html";
import { stripOpenTrackingPixels } from "@/lib/signals/email-tracking";
import { cn } from "@/lib/utils";

export function EmailHtmlBody({
  html,
  className,
}: {
  html: string;
  className?: string;
}) {
  // Drop the open-tracking pixel before rendering: the portal previewing a sent
  // email must not register as the recipient opening it.
  const raw = stripOpenTrackingPixels(html || "");
  if (!looksLikeEmailHtml(raw)) {
    return (
      <p className={cn("whitespace-pre-wrap break-words text-sm leading-6 text-slate-700", className)}>
        {raw}
      </p>
    );
  }
  const safe = sanitizeEmailHtml(raw, isSafeDisplayImageUrl);
  if (!safe) {
    return null;
  }
  return (
    <div
      className={cn("email-html", className)}
      dangerouslySetInnerHTML={{ __html: safe }}
    />
  );
}
