"use client";

import {
  AFTER_EMAIL_MIN_OFFSET_MINUTES,
  formatAfterEmailEtLabel,
  normalizeAfterEmailOffsetMinutes,
  scheduledAtAfterEmail,
} from "@/lib/after-email-followup";

export function AfterEmailTiming({
  emailScheduledAt,
  offsetMinutes,
  onOffsetMinutesChange,
  disabled,
}: {
  emailScheduledAt: string;
  offsetMinutes: number;
  onOffsetMinutesChange: (value: number) => void;
  disabled?: boolean;
}) {
  const offset = normalizeAfterEmailOffsetMinutes(offsetMinutes);
  let preview = "";
  try {
    preview = formatAfterEmailEtLabel(scheduledAtAfterEmail(emailScheduledAt, offset));
  } catch {
    preview = "—";
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2" lang="en">
      <label className="flex items-center gap-2 text-xs text-slate-600">
        <span className="whitespace-nowrap">Minutes after email</span>
        <input
          type="number"
          min={AFTER_EMAIL_MIN_OFFSET_MINUTES}
          step={1}
          value={offset}
          disabled={disabled}
          onChange={(event) => onOffsetMinutesChange(normalizeAfterEmailOffsetMinutes(Number(event.target.value)))}
          aria-label="Minutes after the email scheduled time"
          className="h-9 w-20 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 shadow-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
        />
      </label>
      <p className="text-[11px] text-slate-500" title="America/New_York">
        Scheduled for {preview} ET (email + {offset} min)
      </p>
    </div>
  );
}
