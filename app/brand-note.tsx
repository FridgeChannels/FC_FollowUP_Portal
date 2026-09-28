"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Save, StickyNote, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

const noteKey = (customerId: string) => `fc-followup-brand-note:${customerId}`;

export function BrandNote({
  customerId,
  value,
  onSave,
  disabled = false,
}: {
  customerId: string;
  /** When provided (Notion-backed brands), note is loaded/saved via Follow-up ClientDB `Human Notes`. */
  value?: string | null;
  onSave?: (next: string) => Promise<void>;
  disabled?: boolean;
}) {
  const remote = !!onSave;
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(() => {
    if (remote) return value || "";
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem(noteKey(customerId)) || "";
  });
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const saveTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!remote) return;
    setNote(value || "");
  }, [remote, value, customerId]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, []);

  const flashSaved = () => {
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1200);
  };

  const persistRemote = (next: string) => {
    if (!onSave) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      setSaving(true);
      void onSave(next)
        .then(() => flashSaved())
        .catch((error) => toast.error(error instanceof Error ? error.message : "Unable to save note"))
        .finally(() => setSaving(false));
    }, 500);
  };

  const updateNote = (next: string) => {
    setNote(next);
    if (remote) {
      persistRemote(next);
      return;
    }
    window.localStorage.setItem(noteKey(customerId), next);
    flashSaved();
  };

  const clearNote = () => {
    setNote("");
    if (remote) {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      setSaving(true);
      void onSave!("")
        .then(() => flashSaved())
        .catch((error) => toast.error(error instanceof Error ? error.message : "Unable to clear note"))
        .finally(() => setSaving(false));
      return;
    }
    window.localStorage.removeItem(noteKey(customerId));
    flashSaved();
  };

  return (
    <div className="relative w-full">
      <Button type="button" variant="outline" className="w-full" disabled={disabled} onClick={() => setOpen(true)}>
        <StickyNote className="mr-2 size-4" />
        {note.trim() ? "Edit Note" : "Add Note"}
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
            disabled={disabled}
            className="mt-3 min-h-0 flex-1 resize-none rounded-xl border-0 bg-amber-50/70 p-3 text-sm leading-6 text-amber-950 shadow-inner outline-none placeholder:text-amber-700/60 focus:ring-2 focus:ring-amber-300 disabled:opacity-60"
          />
          <div className="mt-3 flex items-center justify-between gap-2 text-xs text-amber-800">
            <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-amber-800 hover:bg-amber-200 hover:text-amber-950" onClick={clearNote} disabled={disabled || !note || saving}>
              <Trash2 className="mr-1.5 size-3.5" />
              Clear
            </Button>
            <span className="inline-flex items-center gap-1.5">
              {saving ? <Save className="size-3.5 animate-pulse" /> : saved ? <Check className="size-3.5" /> : <Save className="size-3.5" />}
              {saving ? "Saving…" : saved ? "Saved" : "Auto-saved"}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
