"use client";

import { useState } from "react";
import { Check, Save, StickyNote, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const noteKey = (customerId: string) => `fc-followup-brand-note:${customerId}`;

export function BrandNote({ customerId }: { customerId: string }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(() => {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem(noteKey(customerId)) || "";
  });
  const [saved, setSaved] = useState(false);

  const updateNote = (value: string) => {
    setNote(value);
    window.localStorage.setItem(noteKey(customerId), value);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1200);
  };

  const clearNote = () => {
    setNote("");
    window.localStorage.removeItem(noteKey(customerId));
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1200);
  };

  return (
    <div className="relative w-full">
      <Button type="button" variant="outline" className="w-full" onClick={() => setOpen(true)}>
        <StickyNote className="mr-2 size-4" />
        Add Note
      </Button>

      {open ? (
        <div className="absolute right-0 top-full z-50 mt-3 flex h-80 w-80 max-w-[calc(100vw-2rem)] flex-col rounded-2xl bg-amber-100 p-4 shadow-2xl ring-1 ring-amber-200 xl:right-full xl:top-0 xl:mr-3 xl:mt-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-bold text-amber-950">
              <StickyNote className="size-4" />
              Brand note
            </div>
            <Button type="button" variant="ghost" size="icon" className="size-7 text-amber-800 hover:bg-amber-200 hover:text-amber-950" aria-label="Close note" title="Close note" onClick={() => setOpen(false)}>
              <X className="size-4" />
            </Button>
          </div>
          <textarea
            value={note}
            onChange={(event) => updateNote(event.target.value)}
            placeholder="Write a note…"
            autoFocus
            className="mt-3 min-h-0 flex-1 resize-none rounded-xl border-0 bg-amber-50/70 p-3 text-sm leading-6 text-amber-950 shadow-inner outline-none placeholder:text-amber-700/60 focus:ring-2 focus:ring-amber-300"
          />
          <div className="mt-3 flex items-center justify-between gap-2 text-xs text-amber-800">
            <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-amber-800 hover:bg-amber-200 hover:text-amber-950" onClick={clearNote} disabled={!note}>
              <Trash2 className="mr-1.5 size-3.5" />
              Clear
            </Button>
            <span className="inline-flex items-center gap-1.5">
              {saved ? <Check className="size-3.5" /> : <Save className="size-3.5" />}
              {saved ? "Saved" : "Auto-saved"}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
