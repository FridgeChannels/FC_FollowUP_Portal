"use client";

import { useMemo, useState } from "react";
import { enUS } from "date-fns/locale";
import { CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  easternDateOnly,
  formatEasternDateTimeLocal,
} from "@/lib/scheduling-engine/calendar";

export type DeliveryMode = "immediate" | "scheduled" | "queue";

function parseCivilDate(value: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) return undefined;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function formatCivilDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatCivilDateLabel(value: string) {
  const date = parseCivilDate(value);
  if (!date) return "Pick date";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function splitEasternLocal(value: string) {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) return { date: "", time: "09:00" };
  return { date: match[1], time: `${match[2]}:${match[3]}` };
}

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
  const [open, setOpen] = useState(false);
  const todayEt = easternDateOnly();
  const nowEtLocal = formatEasternDateTimeLocal();
  const { date: selectedDate, time: selectedTime } = splitEasternLocal(scheduledAt);
  const selectedDay = useMemo(
    () => (selectedDate ? parseCivilDate(selectedDate) : undefined),
    [selectedDate],
  );
  const minTime = selectedDate === todayEt ? nowEtLocal.slice(11, 16) : undefined;

  const commit = (date: string, time: string) => {
    if (!date || !time) {
      onScheduledAtChange("");
      return;
    }
    onScheduledAtChange(`${date}T${time}`);
  };

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <div className="flex rounded-lg bg-slate-100 p-1" role="group" aria-label="Send timing">
        {([
          ["queue", "Queue"],
          ["immediate", "Send now"],
          ["scheduled", "Schedule"],
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
        <div className="flex flex-wrap items-center gap-2" lang="en">
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={`h-9 justify-start px-2.5 text-xs font-normal ${selectedDate ? "" : "text-muted-foreground"}`}
              >
                <CalendarClock className="size-3.5 text-slate-400" />
                {formatCivilDateLabel(selectedDate)}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-auto p-0" lang="en">
              <Calendar
                mode="single"
                locale={enUS}
                selected={selectedDay}
                defaultMonth={selectedDay}
                disabled={(day) => formatCivilDate(day) < todayEt}
                onSelect={(day) => {
                  if (!day) return;
                  const nextDate = formatCivilDate(day);
                  let nextTime = selectedTime || "09:00";
                  if (nextDate === todayEt && nextTime < nowEtLocal.slice(11, 16)) {
                    nextTime = nowEtLocal.slice(11, 16);
                  }
                  commit(nextDate, nextTime);
                  setOpen(false);
                }}
                formatters={{
                  formatCaption: (date) =>
                    new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(date),
                  formatWeekdayName: (date) =>
                    new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(date),
                  formatMonthDropdown: (date) =>
                    new Intl.DateTimeFormat("en-US", { month: "short" }).format(date),
                }}
              />
            </PopoverContent>
          </Popover>
          <input
            type="time"
            lang="en"
            value={selectedTime}
            min={minTime}
            onChange={(event) => {
              const nextTime = event.target.value || "09:00";
              const nextDate = selectedDate || todayEt;
              commit(nextDate, nextTime);
            }}
            aria-label="Schedule send time (Eastern Time)"
            className="h-9 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 shadow-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
          />
          <span className="text-[11px] font-medium text-slate-500" title="America/New_York">
            ET
          </span>
        </div>
      )}
    </div>
  );
}
