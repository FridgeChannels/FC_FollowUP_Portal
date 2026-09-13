"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Bomb,
  Braces,
  MoreHorizontal,
  Plus,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useWorkspace } from "./workspace-store";
import {
  BombStep,
  BombTemplate,
  BombCustomVariable,
  Channel,
  CPCode,
  uid,
} from "@/lib/outreach-domain";
import { templateVariables, variableToken } from "@/lib/template-variables";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ChannelIcon } from "./channel-icon";

const show = (r: { ok: boolean; message: string }) =>
  r.ok ? toast.success(r.message) : toast.error(r.message);

type VariableCategory = "All" | "Contact" | "Brand" | "Sender" | "Custom";

function TemplateVariableField({
  value,
  onChange,
  placeholder,
  customVariables = [],
  onCreateCustom,
  singleLine = false,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  customVariables?: BombCustomVariable[];
  onCreateCustom: () => void;
  singleLine?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<VariableCategory>("All");
  const [query, setQuery] = useState("");
  const [selection, setSelection] = useState({ start: value.length, end: value.length });
  const variables = [
    ...templateVariables,
    ...customVariables.map((item) => ({
      key: `variable.${item.key}`,
      label: item.label,
      category: "Custom" as const,
      description: item.defaultValue || "Custom template value",
    })),
  ].filter(
    (item) =>
      (category === "All" || item.category === category) &&
      `${item.label} ${item.key} ${item.description}`
        .toLowerCase()
        .includes(query.toLowerCase()),
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
          setSelection({ start: event.currentTarget.selectionStart, end: event.currentTarget.selectionEnd });
        }}
        onSelect={(event) => setSelection({ start: event.currentTarget.selectionStart, end: event.currentTarget.selectionEnd })}
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
                {(["All", "Contact", "Brand", "Sender", "Custom"] as VariableCategory[]).map((item) => (
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
              {variables.length ? variables.map((item) => (
                <button
                  type="button"
                  key={item.key}
                  onClick={() => insertVariable(item.key)}
                  className="flex w-full flex-col rounded-md px-3 py-2.5 text-left hover:bg-slate-50"
                >
                  <span className="text-sm font-medium text-slate-800">{item.label}</span>
                  <span className="mt-0.5 text-xs text-slate-500">{variableToken(item.key)} · {item.description}</span>
                </button>
              )) : (
                <p className="px-3 py-6 text-center text-sm text-slate-500">No variables match this search.</p>
              )}
            </div>
            <div className="border-t p-1.5">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onCreateCustom();
                }}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium text-violet-700 hover:bg-violet-50"
              >
                <Plus className="size-4" />
                Create custom variable
              </button>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}

function CustomVariableDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (variable: BombCustomVariable) => void;
}) {
  const [label, setLabel] = useState("");
  const [defaultValue, setDefaultValue] = useState("");
  const key = label.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "");
  const create = () => {
    if (!key) return;
    onCreate({ id: uid("variable"), key, label: label.trim(), defaultValue });
    setLabel("");
    setDefaultValue("");
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create custom variable</DialogTitle>
          <DialogDescription>
            Add a reusable value for this Bomb template. Its default is used whenever the Bomb is launched.
          </DialogDescription>
        </DialogHeader>
        <label className="text-sm font-medium">
          Variable name
          <Input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="For example: offer name" className="mt-2" />
        </label>
        {key && <p className="text-xs text-slate-500">Used as {variableToken(`variable.${key}`)}</p>}
        <label className="text-sm font-medium">
          Default value
          <Input value={defaultValue} onChange={(event) => setDefaultValue(event.target.value)} placeholder="For example: FC Magnet" className="mt-2" />
        </label>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" disabled={!key} onClick={create}>Create variable</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function BombsPage() {
  const { state, can, setBombStatus, createBomb } = useWorkspace();
  const router = useRouter();
  const [tab, setTab] = useState("Active");
  const [create, setCreate] = useState(false);
  const bombs = state.bombs.filter((b) => tab === "All" || b.status === tab);
  const duplicate = (b: BombTemplate) => {
    const r = createBomb({
      ...b,
      name: `${b.name} copy`,
      status: "Draft",
      steps: b.steps.map((s) => ({ ...s, id: uid("step") })),
    });
    show(r);
    if (r.ok && r.id) router.push(`/bombs/${r.id}/edit`);
  };
  return (
    <div className="mx-auto max-w-[1480px]">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[.14em] text-violet-600">
            Automation templates
          </div>
          <h1 className="mt-1 text-2xl font-bold">Bombs</h1>
        </div>
        {can("editBomb") && (
          <Button onClick={() => setCreate(true)}>
            <Plus className="mr-2 size-4" />
            New Bomb
          </Button>
        )}
      </div>
      <div className="mb-4 flex gap-1">
        {["Active", "Draft", "Inactive", "All"].map((x) => (
          <button
            key={x}
            onClick={() => setTab(x)}
            className={`rounded-lg px-4 py-2 text-xs font-semibold ${tab === x ? "bg-slate-950 text-white" : "bg-white text-slate-500 hover:bg-slate-100"}`}
          >
            {x}
          </button>
        ))}
      </div>
      <div className="overflow-hidden rounded-2xl bg-white">
        {bombs.length ? (
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead className="pl-5">Bomb</TableHead>
                <TableHead>CP</TableHead>
                <TableHead>Scenario</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Flow</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Launches</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {bombs.map((b) => (
                <TableRow
                  key={b.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/bombs/${b.id}/edit`)}
                >
                  <TableCell className="pl-5">
                    <div className="font-semibold">{b.name}</div>
                    <div className="mt-1 max-w-sm truncate text-xs text-slate-500">
                      {b.goal}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{b.cp}</Badge>
                  </TableCell>
                  <TableCell className="text-xs">
                    {state.scenarios.find((item) => item.id === b.scenarioId)?.name || "—"}
                  </TableCell>
                  <TableCell className="text-xs">{b.targetRole}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      {b.steps.slice(0, 5).map((s) => (
                        <span
                          key={s.id}
                          title={s.channel}
                          className="grid size-7 place-items-center"
                        >
                          <ChannelIcon channel={s.channel} className="size-6" />
                        </span>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs">V{b.version}</TableCell>
                  <TableCell className="text-xs">{b.launches}</TableCell>
                  <TableCell>
                    <Badge
                      className={
                        b.status === "Active"
                          ? "bg-emerald-100 text-emerald-700"
                          : b.status === "Draft"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-slate-100 text-slate-600"
                      }
                    >
                      {b.status}
                    </Badge>
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon-sm" variant="ghost">
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => router.push(`/bombs/${b.id}/edit`)}
                        >
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => duplicate(b)}>
                          Duplicate
                        </DropdownMenuItem>
                        {b.status === "Active" ? (
                          <DropdownMenuItem
                            onClick={() =>
                              show(setBombStatus(b.id, "Inactive"))
                            }
                          >
                            Deactivate
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem
                            onClick={() => show(setBombStatus(b.id, "Active"))}
                          >
                            Activate
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <Empty className="py-24">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Bomb />
              </EmptyMedia>
              <EmptyTitle>No Bombs here</EmptyTitle>
              <EmptyDescription>
                Create a simple multi-channel outreach flow.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </div>
      <NewBombDialog
        open={create}
        onOpenChange={setCreate}
        onCreated={(id) => router.push(`/bombs/${id}/edit`)}
      />
    </div>
  );
}

function NewBombDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (id: string) => void;
}) {
  const { state, createBomb } = useWorkspace();
  const [name, setName] = useState("");
  const [cp, setCP] = useState<CPCode>("CP1");
  const [scenarioId, setScenarioId] = useState("");
  const scenarios = state.scenarios.filter((item) => item.cp === cp);
  const scenario = scenarios.find((item) => item.id === scenarioId) || scenarios[0];
  const submit = () => {
    if (!scenario) return;
    const r = createBomb({
      name,
      cp,
      scenarioId: scenario.id,
      goal: scenario.description,
      targetRole: "Connector",
      priority: "Normal",
      status: "Draft",
      customVariables: [],
      steps: [
        {
          id: uid("step"),
          channel: "Email",
          delayDays: 0,
          subject: "",
          content: "",
        },
      ],
    });
    show(r);
    if (r.ok && r.id) {
      onOpenChange(false);
      setName("");
      setCP("CP1");
      setScenarioId("");
      onCreated(r.id);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Bomb</DialogTitle>
          <DialogDescription>
            Start with one action, then build a simple vertical flow.
          </DialogDescription>
        </DialogHeader>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Bomb name"
        />
        <Select value={cp} onValueChange={(v) => { setCP(v as CPCode); setScenarioId(""); }}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {["CP1", "CP2", "CP3"].map((x) => (
              <SelectItem key={x} value={x}>
                {x}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="grid gap-2 text-sm font-medium">
          Scenario
          <Select value={scenario?.id || ""} onValueChange={setScenarioId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select a scenario" />
            </SelectTrigger>
            <SelectContent>
              {scenarios.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        {scenario && <p className="text-xs text-slate-500">{scenario.description}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!name.trim() || !scenario} onClick={submit}>
            Create draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function BombEditor({ bombId }: { bombId: string }) {
  const { state, saveBomb, setBombStatus } = useWorkspace();
  const router = useRouter();
  const original = state.bombs.find((b) => b.id === bombId);
  const [draft, setDraft] = useState<BombTemplate | undefined>(
    original ? JSON.parse(JSON.stringify(original)) : undefined,
  );
  const [customVariableOpen, setCustomVariableOpen] = useState(false);
  if (!draft || !original)
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <div className="text-center">
          <Bomb className="mx-auto size-9 text-slate-300" />
          <h1 className="mt-3 font-bold">Bomb not found</h1>
          <Button variant="link" onClick={() => router.push("/bombs")}>
            Back to Bombs
          </Button>
        </div>
      </div>
    );
  const updateStep = (id: string, patch: Partial<BombStep>) =>
    setDraft({
      ...draft,
      steps: draft.steps.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    });
  const move = (index: number, direction: -1 | 1) => {
    const steps = [...draft.steps];
    const target = index + direction;
    if (target < 0 || target >= steps.length) return;
    [steps[index], steps[target]] = [steps[target], steps[index]];
    setDraft({ ...draft, steps });
  };
  const customVariables = draft.customVariables || [];
  const addCustomVariable = (variable: BombCustomVariable) => {
    if (customVariables.some((item) => item.key === variable.key)) {
      toast.error("A variable with this name already exists");
      return;
    }
    setDraft({ ...draft, customVariables: [...customVariables, variable] });
  };
  const errors = [
    !draft.name && "Name",
    !draft.goal && "Goal",
    !draft.targetRole && "Target role",
    !draft.steps.length && "At least one action",
    draft.steps.some(
      (s) => s.channel === "Email" && (!s.subject || !s.content),
    ) && "Email subject/body",
    draft.steps.some(
      (s) => s.channel === "Phone" && (!s.callGoal || !s.script),
    ) && "Phone goal/script",
    draft.steps.some(
      (s) => !["Email", "Phone"].includes(s.channel) && !s.content,
    ) && "Message content",
  ].filter(Boolean);
  return (
    <div className="mx-auto max-w-[1480px]">
      <button
        onClick={() => router.push("/bombs")}
        className="mb-5 flex items-center gap-2 text-sm font-semibold text-slate-500"
      >
        <ArrowLeft className="size-4" />
        Bombs
      </button>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-violet-600">
            {draft.status} · Version {draft.version}
          </div>
          <h1 className="mt-1 text-2xl font-bold">Edit Bomb</h1>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              const r = setBombStatus(
                draft.id,
                draft.status === "Active" ? "Inactive" : "Active",
              );
              show(r);
              setDraft({
                ...draft,
                status: draft.status === "Active" ? "Inactive" : "Active",
              });
            }}
          >
            {draft.status === "Active" ? "Deactivate" : "Activate"}
          </Button>
          <Button
            disabled={!!errors.length}
            onClick={() => show(saveBomb(draft))}
          >
            <Save className="mr-2 size-4" />
            {draft.status === "Active" ? "Save as new version" : "Save draft"}
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
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </label>
              <label className="text-sm font-medium">
                Applicable CP
                <Select
                  value={draft.cp}
                  onValueChange={(v) => setDraft({ ...draft, cp: v as CPCode })}
                >
                  <SelectTrigger className="mt-2 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["CP1", "CP2", "CP3"].map((x) => (
                      <SelectItem key={x} value={x}>
                        {x}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="text-sm font-medium md:col-span-2">
                Goal
                <Input
                  className="mt-2"
                  value={draft.goal}
                  onChange={(e) => setDraft({ ...draft, goal: e.target.value })}
                />
              </label>
              <label className="text-sm font-medium">
                Target role
                <Select
                  value={draft.targetRole}
                  onValueChange={(v) =>
                    setDraft({
                      ...draft,
                      targetRole: v as BombTemplate["targetRole"],
                    })
                  }
                >
                  <SelectTrigger className="mt-2 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["Connector", "Owner", "Other"].map((x) => (
                      <SelectItem key={x} value={x}>
                        {x}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="text-sm font-medium">
                Priority
                <Select
                  value={draft.priority}
                  onValueChange={(v) =>
                    setDraft({
                      ...draft,
                      priority: v as BombTemplate["priority"],
                    })
                  }
                >
                  <SelectTrigger className="mt-2 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["Urgent", "High", "Normal", "Low"].map((x) => (
                      <SelectItem key={x} value={x}>
                        {x}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <div className="md:col-span-2">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">Custom variables</div>
                    <p className="mt-1 text-xs text-slate-500">Saved defaults that can be inserted into any message or call script.</p>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={() => setCustomVariableOpen(true)}>
                    <Plus className="size-3.5" />
                    Add variable
                  </Button>
                </div>
                {customVariables.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {customVariables.map((item) => (
                      <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{item.label}</div>
                          <div className="truncate text-xs text-slate-500">{variableToken(`variable.${item.key}`)} · {item.defaultValue || "No default value"}</div>
                        </div>
                        <Button
                          type="button"
                          size="icon-xs"
                          variant="ghost"
                          aria-label={`Remove ${item.label}`}
                          className="text-slate-500 hover:text-rose-600"
                          onClick={() => setDraft({ ...draft, customVariables: customVariables.filter((variable) => variable.id !== item.id) })}
                        >
                          <X className="size-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>
          <section className="rounded-2xl bg-white p-5">
            <div className="flex justify-between">
              <div>
                <h2 className="font-bold">Action flow</h2>
                <p className="text-xs text-slate-500">
                  Sequence is assigned automatically when the Bomb is launched.
                </p>
              </div>
              <Select
                onValueChange={(v) =>
                  setDraft({
                    ...draft,
                    steps: [
                      ...draft.steps,
                      {
                        id: uid("step"),
                        channel: v as Channel,
                        delayDays: draft.steps.length ? 1 : 0,
                        subject: v === "Email" ? "" : "",
                        content: "",
                        callGoal: v === "Phone" ? "" : "",
                        script: v === "Phone" ? "" : "",
                      },
                    ],
                  })
                }
              >
                <SelectTrigger size="sm" className="w-40">
                  <SelectValue placeholder="+ Add action" />
                </SelectTrigger>
                <SelectContent>
                  {["Email", "SMS", "WhatsApp", "LinkedIn", "Phone"].map(
                    (x) => (
                      <SelectItem key={x} value={x}>
                        {x}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="mt-5 space-y-4">
              {draft.steps.map((s, index) => (
                <div key={s.id} className="rounded-xl bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="grid size-8 place-items-center rounded-lg bg-white font-bold text-violet-600">
                        {index + 1}
                      </span>
                      <Select
                        value={s.channel}
                        onValueChange={(v) =>
                          updateStep(s.id, { channel: v as Channel })
                        }
                      >
                        <SelectTrigger size="sm" className="w-36">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[
                            "Email",
                            "SMS",
                            "WhatsApp",
                            "LinkedIn",
                            "Phone",
                          ].map((x) => (
                            <SelectItem key={x} value={x}>
                              {x}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => move(index, -1)}
                      >
                        <ArrowUp className="size-3.5" />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => move(index, 1)}
                      >
                        <ArrowDown className="size-3.5" />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        className="text-rose-600"
                        onClick={() =>
                          setDraft({
                            ...draft,
                            steps: draft.steps.filter((x) => x.id !== s.id),
                          })
                        }
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3">
                    {s.channel === "Email" && (
                      <TemplateVariableField
                        value={s.subject || ""}
                        onChange={(value) => updateStep(s.id, { subject: value })}
                        placeholder="Email subject"
                        customVariables={customVariables}
                        onCreateCustom={() => setCustomVariableOpen(true)}
                        singleLine
                      />
                    )}
                    {s.channel === "Phone" ? (
                      <>
                        <Input
                          value={s.callGoal || ""}
                          onChange={(e) =>
                            updateStep(s.id, { callGoal: e.target.value })
                          }
                          placeholder="Call goal"
                        />
                        <TemplateVariableField
                          value={s.script || ""}
                          onChange={(value) => updateStep(s.id, { script: value })}
                          placeholder="Suggested script"
                          customVariables={customVariables}
                          onCreateCustom={() => setCustomVariableOpen(true)}
                        />
                      </>
                    ) : (
                      <TemplateVariableField
                        value={s.content}
                        onChange={(value) => updateStep(s.id, { content: value })}
                        placeholder={`${s.channel} content`}
                        customVariables={customVariables}
                        onCreateCustom={() => setCustomVariableOpen(true)}
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
            <h2 className="mt-1 font-bold">{draft.name || "Untitled Bomb"}</h2>
            <div className="mt-6 space-y-5">
              {draft.steps.map((s, i) => {
                return (
                  <div key={s.id} className="flex gap-3">
                    <span className="grid size-8 shrink-0 place-items-center">
                      <ChannelIcon channel={s.channel} className="size-6" />
                    </span>
                    <div>
                      <div className="text-[10px] font-semibold uppercase text-slate-500">
                        Step {i + 1}
                      </div>
                      <div className="text-sm font-semibold">{s.channel}</div>
                    </div>
                  </div>
                );
              })}
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
      <CustomVariableDialog
        open={customVariableOpen}
        onOpenChange={setCustomVariableOpen}
        onCreate={addCustomVariable}
      />
    </div>
  );
}
