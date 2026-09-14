/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Bomb,
  Braces,
  Save,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  BOMB_CHANNELS,
  BOMB_PRIORITIES,
  BOMB_TARGET_ROLES,
  isBombChannel,
  type BombDetail,
  type BombScenario,
} from "@/lib/bomb-list";
import { listApplicableCps } from "@/lib/brand-list";
import { BombStep, Channel, interactionCpCode, uid } from "@/lib/outreach-domain";
import { templateVariables, variableToken } from "@/lib/template-variables";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ChannelIcon } from "./channel-icon";
import { usePageMetadata } from "./use-page-metadata";

type VariableCategory = "All" | "Contact" | "Brand" | "Sender";

type EditorDraft = {
  name: string;
  goal: string;
  cpId: string;
  targetRole: string;
  priority: string;
  notes: string;
  status: string;
  steps: BombStep[];
};

function draftFromBomb(bomb: BombDetail): EditorDraft {
  return {
    name: bomb.name,
    goal: bomb.goal,
    cpId: interactionCpCode(bomb.cps[0]?.name) || interactionCpCode(bomb.cp) || "",
    targetRole: bomb.targetRole || "Connector",
    priority: bomb.priority || "P1",
    notes: bomb.notes || "",
    status: bomb.status || "Draft",
    steps: bomb.templates.length
      ? bomb.templates.map((template) => {
          const channel = isBombChannel(template.channel) ? template.channel : "Email";
          const phone = channel === "Phone";
          return {
            id: template.id,
            channel,
            delayDays: 0,
            subject: template.subject || "",
            content: phone ? "" : template.content,
            callGoal: phone ? template.name : "",
            script: phone ? template.content : "",
          };
        })
      : [
          {
            id: uid("step"),
            channel: "Email",
            delayDays: 0,
            subject: "",
            content: "",
          },
        ],
  };
}

function TemplateVariableField({
  value,
  onChange,
  placeholder,
  singleLine = false,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  singleLine?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<VariableCategory>("All");
  const [query, setQuery] = useState("");
  const [selection, setSelection] = useState({ start: value.length, end: value.length });
  const variables = templateVariables.filter(
    (item) =>
      (category === "All" || item.category === category) &&
      `${item.label} ${item.key} ${item.description}`.toLowerCase().includes(query.toLowerCase()),
  );
  const insertVariable = (key: string) => {
    const { start, end } = selection;
    const token = variableToken(key);
    onChange(`${value.slice(0, start)}${token}${value.slice(end)}`);
    setSelection({ start: start + token.length, end: start + token.length });
    setOpen(false);
  };
  return (
    <div className="relative">
      <Textarea
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setSelection({
            start: event.currentTarget.selectionStart,
            end: event.currentTarget.selectionEnd,
          });
        }}
        onSelect={(event) =>
          setSelection({
            start: event.currentTarget.selectionStart,
            end: event.currentTarget.selectionEnd,
          })
        }
        onKeyDown={(event) => {
          if (event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey) {
            event.preventDefault();
            setOpen(true);
          }
        }}
        placeholder={placeholder}
        rows={singleLine ? 1 : undefined}
        className={singleLine ? "min-h-10 resize-none" : undefined}
      />
      <div className="mt-2 flex items-center justify-between gap-2 text-xs text-slate-500">
        <span>Type / to add a variable</span>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button type="button" size="xs" variant="ghost" className="text-violet-700">
              <Braces className="size-3.5" />
              Add variable
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))] p-0">
            <div className="border-b p-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <Input
                  autoFocus
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search variables"
                  className="pl-9"
                />
              </div>
              <div className="mt-3 flex gap-1 overflow-x-auto pb-1">
                {(["All", "Contact", "Brand", "Sender"] as VariableCategory[]).map((item) => (
                  <button
                    type="button"
                    key={item}
                    onClick={() => setCategory(item)}
                    className={`shrink-0 rounded-md px-2 py-1.5 text-xs font-medium ${category === item ? "bg-violet-100 text-violet-800" : "text-slate-500 hover:bg-slate-100"}`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
            <div className="max-h-60 overflow-y-auto p-1.5">
              {variables.length ? (
                variables.map((item) => (
                  <button
                    type="button"
                    key={item.key}
                    onClick={() => insertVariable(item.key)}
                    className="flex w-full flex-col rounded-md px-3 py-2.5 text-left hover:bg-slate-50"
                  >
                    <span className="text-sm font-medium text-slate-800">{item.label}</span>
                    <span className="mt-0.5 text-xs text-slate-500">
                      {variableToken(item.key)} · {item.description}
                    </span>
                  </button>
                ))
              ) : (
                <p className="px-3 py-6 text-center text-sm text-slate-500">No variables match this search.</p>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}

export function BombEditor({ bombId }: { bombId: string }) {
  const router = useRouter();
  const [bomb, setBomb] = useState<BombDetail | null>(null);
  const [scenarios, setScenarios] = useState<BombScenario[]>([]);
  const [draft, setDraft] = useState<EditorDraft | undefined>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/bombs/${bombId}`)
      .then(async (response) => {
        const payload = (await response.json()) as {
          bomb?: BombDetail;
          scenarios?: BombScenario[];
          error?: string;
        };
        if (!response.ok) throw new Error(payload.error || "Failed to load OmniReach");
        if (!payload.bomb) throw new Error("OmniReach not found");
        return payload;
      })
      .then((payload) => {
        if (cancelled || !payload.bomb) return;
        setBomb(payload.bomb);
        setScenarios(payload.scenarios || []);
        setDraft(draftFromBomb(payload.bomb));
        setError(undefined);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setBomb(null);
        setDraft(undefined);
        setError(err instanceof Error ? err.message : "Failed to load OmniReach");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bombId]);

  usePageMetadata(
    bomb
      ? {
          title: `Edit ${bomb.name}`,
          description: bomb.goal || "Edit this Follow-up OmniReach.",
        }
      : {
          title: error ? "OmniReach not found" : "Edit OmniReach",
          description: error || "Loading Follow-up OmniReach editor.",
        },
  );

  const save = async (status = draft?.status) => {
    if (!draft || saving) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/bombs/${bombId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draft.name,
          goal: draft.goal,
          cpIds: draft.cpId ? [draft.cpId] : [],
          targetRole: draft.targetRole,
          priority: draft.priority,
          notes: draft.notes,
          status,
          templates: draft.steps.map((step) => ({
            id: step.id.startsWith("step_") ? undefined : step.id,
            channel: step.channel,
            name: step.channel === "Phone" ? step.callGoal : undefined,
            subject: step.subject,
            content: step.channel === "Phone" ? step.script || "" : step.content,
          })),
        }),
      });
      const payload = (await response.json()) as { bomb?: BombDetail; error?: string };
      if (!response.ok) throw new Error(payload.error || "Failed to save OmniReach");
      if (!payload.bomb) throw new Error("OmniReach was not saved");
      setBomb(payload.bomb);
      setDraft(draftFromBomb(payload.bomb));
      toast.success(status === "Active" && draft.status !== "Active" ? "OmniReach activated" : "OmniReach saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save OmniReach");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="grid min-h-[60vh] place-items-center text-sm text-slate-500">
        Loading OmniReach…
      </div>
    );
  }
  if (!draft || error) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <div className="text-center">
          <Bomb className="mx-auto size-9 text-slate-300" />
          <h1 className="mt-3 font-bold">OmniReach not found</h1>
          {error && <p className="mt-2 text-sm text-slate-500">{error}</p>}
          <Button variant="link" onClick={() => router.push("/bombs")}>
            Back to OmniReach
          </Button>
        </div>
      </div>
    );
  }

  const updateStep = (id: string, patch: Partial<BombStep>) =>
    setDraft({
      ...draft,
      steps: draft.steps.map((step) => (step.id === id ? { ...step, ...patch } : step)),
    });
  const move = (index: number, direction: -1 | 1) => {
    const steps = [...draft.steps];
    const target = index + direction;
    if (target < 0 || target >= steps.length) return;
    [steps[index], steps[target]] = [steps[target], steps[index]];
    setDraft({ ...draft, steps });
  };
  const errors = [
    !draft.name && "Name",
    !draft.goal && "Goal",
    !draft.targetRole && "Target role",
    !draft.steps.length && "At least one action",
    draft.steps.some((step) => step.channel === "Email" && (!step.subject || !step.content)) && "Email subject/body",
    draft.steps.some((step) => step.channel === "Phone" && (!step.callGoal || !step.script)) && "Phone goal/script",
    draft.steps.some((step) => !["Email", "Phone"].includes(step.channel) && !step.content) && "Message content",
  ].filter(Boolean);

  return (
    <div className="mx-auto max-w-[1480px]">
      <button
        onClick={() => router.push("/bombs")}
        className="mb-5 flex items-center gap-2 text-sm font-semibold text-slate-500"
      >
        <ArrowLeft className="size-4" />
        OmniReach
      </button>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-violet-600">
            {draft.status} · Version 1
          </div>
          <h1 className="mt-1 text-2xl font-bold">Edit OmniReach</h1>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={saving}
            onClick={() => save(draft.status === "Active" ? "Draft" : "Active")}
          >
            {draft.status === "Active" ? "Deactivate" : "Activate"}
          </Button>
          <Button disabled={!!errors.length || saving} onClick={() => save()}>
            <Save className="mr-2 size-4" />
            {saving ? "Saving…" : draft.status === "Active" ? "Save as new version" : "Save draft"}
          </Button>
        </div>
      </div>
      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <main className="space-y-6">
          <section className="rounded-2xl bg-white p-5">
            <h2 className="font-bold">Basic settings</h2>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="text-sm font-medium">
                Name
                <Input
                  className="mt-2"
                  value={draft.name}
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                />
              </label>
              <div className="text-sm font-medium">
                Applicable CP
                <Select value={draft.cpId || undefined} onValueChange={(value) => setDraft({ ...draft, cpId: value })}>
                  <SelectTrigger className="mt-2 w-full">
                    <SelectValue placeholder="Select a CP" />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    {listApplicableCps().map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name} · {item.fullName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <label className="text-sm font-medium md:col-span-2">
                Goal
                <Input
                  className="mt-2"
                  value={draft.goal}
                  onChange={(event) => setDraft({ ...draft, goal: event.target.value })}
                />
              </label>
              <label className="text-sm font-medium">
                Target role
                <Select
                  value={draft.targetRole}
                  onValueChange={(value) => setDraft({ ...draft, targetRole: value })}
                >
                  <SelectTrigger className="mt-2 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BOMB_TARGET_ROLES.map((item) => (
                      <SelectItem key={item} value={item}>
                        {item}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="text-sm font-medium">
                Priority
                <Select
                  value={draft.priority}
                  onValueChange={(value) => setDraft({ ...draft, priority: value })}
                >
                  <SelectTrigger className="mt-2 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BOMB_PRIORITIES.map((item) => (
                      <SelectItem key={item} value={item}>
                        {item}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              {scenarios.length ? (
                <p className="md:col-span-2 text-xs text-slate-500">
                  Scenario: {bomb?.scenarioName || "—"}
                  {bomb?.scenarioDescription ? ` · ${bomb.scenarioDescription}` : ""}
                </p>
              ) : null}
            </div>
          </section>
          <section className="rounded-2xl bg-white p-5">
            <div className="flex justify-between">
              <div>
                <h2 className="font-bold">Action flow</h2>
                <p className="text-xs text-slate-500">
                  Sequence is assigned automatically when OmniReach is launched.
                </p>
              </div>
              <Select
                onValueChange={(value) =>
                  setDraft({
                    ...draft,
                    steps: [
                      ...draft.steps,
                      {
                        id: uid("step"),
                        channel: value as Channel,
                        delayDays: draft.steps.length ? 1 : 0,
                        subject: "",
                        content: "",
                        callGoal: value === "Phone" ? "" : "",
                        script: value === "Phone" ? "" : "",
                      },
                    ],
                  })
                }
              >
                <SelectTrigger size="sm" className="w-40">
                  <SelectValue placeholder="+ Add action" />
                </SelectTrigger>
                <SelectContent>
                  {BOMB_CHANNELS.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="mt-5 space-y-4">
              {draft.steps.map((step, index) => (
                <div key={step.id} className="rounded-xl bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="grid size-8 place-items-center rounded-lg bg-white font-bold text-violet-600">
                        {index + 1}
                      </span>
                      <Select
                        value={step.channel}
                        onValueChange={(value) => updateStep(step.id, { channel: value as Channel })}
                      >
                        <SelectTrigger size="sm" className="w-36">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {BOMB_CHANNELS.map((item) => (
                            <SelectItem key={item} value={item}>
                              {item}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Button size="icon-sm" variant="ghost" onClick={() => move(index, -1)}>
                        <ArrowUp className="size-3.5" />
                      </Button>
                      <Button size="icon-sm" variant="ghost" onClick={() => move(index, 1)}>
                        <ArrowDown className="size-3.5" />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        className="text-rose-600"
                        onClick={() =>
                          setDraft({
                            ...draft,
                            steps: draft.steps.filter((item) => item.id !== step.id),
                          })
                        }
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3">
                    {step.channel === "Email" && (
                      <TemplateVariableField
                        value={step.subject || ""}
                        onChange={(value) => updateStep(step.id, { subject: value })}
                        placeholder="Email subject"
                        singleLine
                      />
                    )}
                    {step.channel === "Phone" ? (
                      <>
                        <Input
                          value={step.callGoal || ""}
                          onChange={(event) => updateStep(step.id, { callGoal: event.target.value })}
                          placeholder="Call goal"
                        />
                        <TemplateVariableField
                          value={step.script || ""}
                          onChange={(value) => updateStep(step.id, { script: value })}
                          placeholder="Suggested script"
                        />
                      </>
                    ) : (
                      <TemplateVariableField
                        value={step.content}
                        onChange={(value) => updateStep(step.id, { content: value })}
                        placeholder={`${step.channel} content`}
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </main>
        <aside className="space-y-5">
          <section className="sticky top-24 rounded-2xl bg-slate-950 p-5 text-white">
            <div className="text-xs font-semibold uppercase tracking-wide text-violet-300">
              Estimated flow
            </div>
            <h2 className="mt-1 font-bold">{draft.name || "Untitled OmniReach"}</h2>
            <div className="mt-6 space-y-5">
              {draft.steps.map((step, index) => (
                <div key={step.id} className="flex gap-3">
                  <span className="grid size-8 shrink-0 place-items-center">
                    <ChannelIcon channel={step.channel} className="size-6" />
                  </span>
                  <div>
                    <div className="text-[10px] font-semibold uppercase text-slate-500">
                      Step {index + 1}
                    </div>
                    <div className="text-sm font-semibold">{step.channel}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-6 rounded-xl bg-white/5 p-4 text-xs leading-5 text-slate-400">
              Phone timing may shift with Caller capacity. Any meaningful reply
              stops all future actions.
            </div>
            {errors.length > 0 && (
              <div className="mt-4 rounded-xl bg-rose-500/10 p-4 text-xs text-rose-200">
                Complete: {errors.join(", ")}
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
