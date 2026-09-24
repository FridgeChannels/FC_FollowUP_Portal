"use client";

export type DeliveryMode = "immediate" | "scheduled" | "queue";

export function SendTimingToggle({
  value,
  onValueChange,
  scheduledAt,
  onScheduledAtChange,
}: {
  value: DeliveryMode;
  onValueChange: (value: DeliveryMode) => void;
  scheduledAt: string;
  onScheduledAtChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <div className="flex rounded-lg bg-slate-100 p-1" role="group" aria-label="Send timing">
        {([
          ["queue", "进入排班"],
          ["immediate", "立即发送"],
          ["scheduled", "定时发送"],
        ] as const).map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            onClick={() => onValueChange(mode)}
            className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition ${value === mode ? "bg-white text-violet-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            aria-pressed={value === mode}
          >
            {label}
          </button>
        ))}
      </div>
      {value === "scheduled" && (
        <input
          type="datetime-local"
          value={scheduledAt}
          min={new Date().toISOString().slice(0, 16)}
          onChange={(event) => onScheduledAtChange(event.target.value)}
          aria-label="Schedule send date and time"
          className="h-9 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 shadow-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
        />
      )}
    </div>
  );
}
