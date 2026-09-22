"use client";

import { isSafeDisplayImageUrl, looksLikeEmailHtml, sanitizeEmailHtml } from "@/lib/email-html";
import { cn } from "@/lib/utils";

export function EmailHtmlBody({
  html,
  className,
}: {
  html: string;
  className?: string;
}) {
  const raw = html || "";
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
      className={cn(
        "email-html break-words text-sm leading-6 text-slate-700",
        "[&_p]:mb-2 [&_p:last-child]:mb-0",
        "[&_a]:text-blue-600 [&_a]:underline",
        "[&_ul]:mb-2 [&_ul]:list-disc [&_ul]:pl-5",
        "[&_ol]:mb-2 [&_ol]:list-decimal [&_ol]:pl-5",
        "[&_img]:my-2 [&_img]:max-h-80 [&_img]:max-w-full [&_img]:rounded-lg [&_img]:object-contain",
        "[&_blockquote]:border-l-2 [&_blockquote]:border-slate-300 [&_blockquote]:pl-3 [&_blockquote]:text-slate-600",
        className,
      )}
      dangerouslySetInnerHTML={{ __html: safe }}
    />
  );
}
