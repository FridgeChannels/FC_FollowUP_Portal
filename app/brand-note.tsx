"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Save, StickyNote, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const noteKey = (customerId: string) => `fc-followup-brand-note:${customerId}`;

/** Wait this long after the last keystroke before writing to Notion. */
const SAVE_IDLE_MS = 2500;

export function BrandNote({
  customerId,
  value,
  onSave,
  disabled = false,
  variant = "button",
}: {
  customerId: string;
  /** When provided (Notion-backed brands), note is loaded/saved via Follow-up ClientDB `Human Notes`. */
  value?: string | null;
  onSave?: (next: string) => Promise<void>;
  disabled?: boolean;
  /** `inline` = compact list-cell trigger; `panel` = editor within a narrow details panel. */
  variant?: "button" | "inline" | "panel";
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
  const [pending, setPending] = useState(false);
  const saveTimer = useRef<number | null>(null);
  const lastSavedRef = useRef(remote ? value || "" : note);
  const noteRef = useRef(note);
  const onSaveRef = useRef(onSave);
  const savingRef = useRef(false);

  useEffect(() => {
    noteRef.current = note;
  }, [note]);

  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  // Only reset from props when the brand changes — avoid clobbering after a local save
  // while the parent still holds a stale humanNotes value.
  useEffect(() => {
    if (!remote) return;
    const next = value || "";
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    setPending(false);
    savingRef.current = false;
    setSaving(false);
    lastSavedRef.current = next;
    setNote(next);
    // Intentionally depend on customerId, not value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remote, customerId]);

  const clearSaveTimer = () => {
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
  };

  const flashSaved = () => {
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1200);
  };

  const scheduleRemoteSave = (next: string) => {
    if (!onSaveRef.current) return;
    clearSaveTimer();
    if (next === lastSavedRef.current) {
      setPending(false);
      return;
    }
    setPending(true);
    setSaved(false);
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = null;
      commitRemote(noteRef.current);
    }, SAVE_IDLE_MS);
  };

  const commitRemote = (next: string) => {
    const save = onSaveRef.current;
    if (!save) return;
    if (next === lastSavedRef.current) {
      setPending(false);
      return;
    }
    if (savingRef.current) {
      scheduleRemoteSave(next);
      return;
    }
    savingRef.current = true;
    setPending(false);
    setSaving(true);
    void save(next)
      .then(() => {
        lastSavedRef.current = next;
        flashSaved();
      })
      .catch((error) => toast.error(error instanceof Error ? error.message : "Unable to save note"))
      .finally(() => {
        savingRef.current = false;
        setSaving(false);
        if (noteRef.current !== lastSavedRef.current) {
          scheduleRemoteSave(noteRef.current);
        }
      });
  };

  const flushRemoteSave = () => {
    if (!onSaveRef.current) return;
    clearSaveTimer();
    commitRemote(noteRef.current);
  };

  useEffect(() => {
    return () => {
      clearSaveTimer();
      // Best-effort flush of unsaved text when the editor unmounts.
      const save = onSaveRef.current;
      const next = noteRef.current;
      if (save && next !== lastSavedRef.current && !savingRef.current) {
        void save(next).catch(() => undefined);
      }
    };
  }, []);

  const updateNote = (next: string) => {
    setNote(next);
    if (remote) {
      scheduleRemoteSave(next);
      return;
    }
    window.localStorage.setItem(noteKey(customerId), next);
    flashSaved();
  };

  const clearNote = () => {
    setNote("");
    if (remote) {
      clearSaveTimer();
      setPending(false);
      savingRef.current = true;
      setSaving(true);
      void onSave!("")
        .then(() => {
          lastSavedRef.current = "";
          flashSaved();
        })
        .catch((error) => toast.error(error instanceof Error ? error.message : "Unable to clear note"))
        .finally(() => {
          savingRef.current = false;
          setSaving(false);
        });
      return;
    }
    window.localStorage.removeItem(noteKey(customerId));
    flashSaved();
  };

  const setOpenAndFlush = (next: boolean) => {
    if (!next && open) flushRemoteSave();
    setOpen(next);
  };

  const trimmed = note.trim();
  const canEdit = !!onSave && !disabled;
  const statusLabel = saving
    ? "Saving…"
    : pending
      ? "Waiting…"
      : saved
        ? "Saved"
        : "Idle";

  const editor = (
    <>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-bold text-amber-950">
          <StickyNote className="size-4" />
          Brand note
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 text-amber-800 hover:bg-amber-200 hover:text-amber-950"
          aria-label="Close note"
          title="Close note"
          onClick={() => setOpenAndFlush(false)}
        >
          <X className="size-4" />
        </Button>
      </div>
      <textarea
        value={note}
        onChange={(event) => updateNote(event.target.value)}
        placeholder="Write a note…"
        autoFocus
        disabled={disabled || !canEdit}
        readOnly={!canEdit}
        className="mt-3 min-h-0 flex-1 resize-none rounded-xl border-0 bg-amber-50/70 p-3 text-sm leading-6 text-amber-950 shadow-inner outline-none placeholder:text-amber-700/60 focus:ring-2 focus:ring-amber-300 disabled:opacity-60"
      />
      <div className="mt-3 flex items-center justify-between gap-2 text-xs text-amber-800">
        {canEdit ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-amber-800 hover:bg-amber-200 hover:text-amber-950"
            onClick={clearNote}
            disabled={disabled || (!note && !pending) || saving}
          >
            <Trash2 className="mr-1.5 size-3.5" />
            Clear
          </Button>
        ) : (
          <span />
        )}
        {canEdit ? (
          <span className="inline-flex items-center gap-1.5" title="Saves a few seconds after you stop typing">
            {saving || pending ? <Save className={`size-3.5 ${saving ? "animate-pulse" : ""}`} /> : saved ? <Check className="size-3.5" /> : <Save className="size-3.5 opacity-50" />}
            {statusLabel}
          </span>
        ) : null}
      </div>
    </>
  );

  if (variant === "inline") {
    return (
      <Popover open={open} onOpenChange={setOpenAndFlush}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            onClick={(event) => event.stopPropagation()}
            title={trimmed || (canEdit ? "Add note" : undefined)}
            className={`w-full max-w-56 rounded-md px-1.5 py-1 text-left text-xs leading-5 transition hover:bg-amber-50 disabled:opacity-60 ${
              trimmed ? "text-slate-600" : "text-slate-400"
            }`}
          >
            <span className="line-clamp-2 whitespace-pre-wrap break-words">
              {trimmed || (canEdit ? "Add note" : "—")}
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="flex h-72 w-80 max-w-[calc(100vw-2rem)] flex-col rounded-2xl border-0 bg-amber-100 p-4 shadow-2xl ring-1 ring-amber-200"
          onClick={(event) => event.stopPropagation()}
        >
          {editor}
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <div className={variant === "panel" ? "w-full" : "relative w-full"}>
      {variant === "panel" && (trimmed ? (
        <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{trimmed}</p>
      ) : (
        <p className="text-sm text-slate-400">No notes yet.</p>
      ))}
      <Button type="button" variant="outline" className={variant === "panel" ? "mt-3 w-full" : "w-full"} disabled={disabled} onClick={() => setOpen(true)}>
        <StickyNote className="mr-2 size-4" />
        {trimmed ? "Edit Note" : "Add Note"}
      </Button>

      {open ? (
        <div className={variant === "panel"
          ? "mt-3 flex h-80 w-full min-w-0 flex-col rounded-2xl bg-amber-100 p-4 ring-1 ring-amber-200"
          : "absolute right-0 top-full z-50 mt-3 flex h-80 w-80 max-w-[calc(100vw-2rem)] flex-col rounded-2xl bg-amber-100 p-4 shadow-2xl ring-1 ring-amber-200 xl:right-full xl:top-0 xl:mr-3 xl:mt-0"}>
          {editor}
        </div>
      ) : null}
    </div>
  );
}
