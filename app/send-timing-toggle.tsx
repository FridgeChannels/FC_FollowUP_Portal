"use client";

import { Switch } from "@/components/ui/switch";

export type DeliveryMode = "immediate" | "scheduled";

export function SendTimingToggle({
  value,
  onValueChange,
}: {
  value: DeliveryMode;
  onValueChange: (value: DeliveryMode) => void;
}) {
  return (
    <div className="flex min-h-9 items-center justify-end gap-2">
      <span className="text-xs font-medium text-slate-600">Send now</span>
      <Switch
        checked={value === "immediate"}
        onCheckedChange={(checked) => onValueChange(checked ? "immediate" : "scheduled")}
        aria-label="Send now"
      />
    </div>
  );
}
