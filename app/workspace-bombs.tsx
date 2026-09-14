/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Bomb, CircleAlert, MoreHorizontal, Plus } from "lucide-react";
import { toast } from "sonner";
import { listApplicableCps, type CurrentCpOption } from "@/lib/brand-list";
import {
  isBombChannel,
  type BombDetail,
  type BombListItem,
  type BombScenario,
  type BombTemplateItem,
} from "@/lib/bomb-list";
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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ChannelIcon } from "./channel-icon";
import { usePageMetadata } from "./use-page-metadata";
import { useWorkspace } from "./workspace-store";
import { CP, PageHeader, Status } from "./workspace-pages";

function bombStatusClass(status: string) {
  if (status === "Active") return "bg-emerald-100 text-emerald-700";
  if (status === "Draft") return "bg-amber-100 text-amber-700";
  return "bg-slate-100 text-slate-600";
}

function bombPath(id: string) {
  return `/bombs/${id}/edit`;
}

function formatWhen(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(date);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-1.5 text-sm text-slate-800">{children}</div>
    </div>
  );
}

function TemplateCard({ template, index }: { template: BombTemplateItem; index: number }) {
  return (
    <div className="rounded-xl bg-slate-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white font-bold text-violet-600">
            {index + 1}
          </span>
          {isBombChannel(template.channel) ? (
            <ChannelIcon channel={template.channel} className="size-6" />
          ) : null}
          <div className="min-w-0">
            <div className="truncate font-semibold">{template.name || "Untitled template"}</div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {template.channel ? <Badge variant="outline">{template.channel}</Badge> : null}
              {template.templateType ? <Badge variant="outline">{template.templateType}</Badge> : null}
              {template.status ? (
                <Badge className={bombStatusClass(template.status)}>{template.status}</Badge>
              ) : null}
            </div>
          </div>
        </div>
      </div>
      <div className="mt-4 space-y-3">
        {template.subject ? (
          <div>
            <div className="text-xs font-medium text-slate-500">Subject</div>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-800">{template.subject}</p>
          </div>
        ) : null}
        <div>
          <div className="text-xs font-medium text-slate-500">
            {template.templateType === "Call Script" ? "Call script" : "Content"}
          </div>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-800">
            {template.content || "—"}
          </p>
        </div>
      </div>
    </div>
  );
}

export function BombsPage() {
  const router = useRouter();
  const { can } = useWorkspace();
  const [tab, setTab] = useState("Active");
  const [create, setCreate] = useState(false);
  const [bombs, setBombs] = useState<BombListItem[]>([]);
  const [scenarios, setScenarios] = useState<BombScenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch("/api/bombs")
      .then(async (response) => {
        const payload = (await response.json()) as {
          bombs?: BombListItem[];
          scenarios?: BombScenario[];
          error?: string;
        };
        if (!response.ok) throw new Error(payload.error || "Failed to load OmniReach");
        return payload;
      })
      .then((payload) => {
        if (cancelled) return;
        setBombs(payload.bombs || []);
        setScenarios(payload.scenarios || []);
        setError(undefined);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load OmniReach");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const visible = bombs.filter((bomb) => tab === "All" || bomb.status === tab);
  return (
    <div className="mx-auto max-w-[1480px]">
      <PageHeader
        eyebrow={loading ? "Loading" : `${bombs.length} records`}
        title="OmniReach"
      >
        {can("editBomb") && (
          <Button onClick={() => setCreate(true)}>
            <Plus className="mr-2 size-4" />
            New OmniReach
          </Button>
        )}
      </PageHeader>
      <div className="mb-4 flex gap-1">
        {["Active", "Draft", "Archived", "All"].map((x) => (
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
        {error ? (
          <Empty className="py-24">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CircleAlert />
              </EmptyMedia>
              <EmptyTitle>Unable to load OmniReach</EmptyTitle>
              <EmptyDescription>{error}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : loading ? (
          <div className="px-5 py-16 text-sm text-slate-500">Loading OmniReach…</div>
        ) : visible.length ? (
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead className="pl-5">OmniReach</TableHead>
                <TableHead>CP</TableHead>
                <TableHead>Scenario</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Flow</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((b) => (
                <TableRow
                  key={b.id}
                  className="cursor-pointer"
                  onClick={() => router.push(bombPath(b.id))}
                >
                  <TableCell className="pl-5">
                    <div className="font-semibold">{b.name}</div>
                    <div className="mt-1 max-w-sm truncate text-xs text-slate-500">
                      {b.goal || "—"}
                    </div>
                  </TableCell>
                  <TableCell>
                    {b.cp ? <Badge variant="outline">{b.cp}</Badge> : "—"}
                  </TableCell>
                  <TableCell className="text-xs">{b.scenarioName || "—"}</TableCell>
                  <TableCell className="text-xs">{b.targetRole || "—"}</TableCell>
                  <TableCell>
                    {b.channels.length ? (
                      <div className="flex items-center gap-1.5">
                        {b.channels.map((channel) =>
                          isBombChannel(channel) ? (
                            <span
                              key={channel}
                              title={channel}
                              className="grid size-7 place-items-center"
                            >
                              <ChannelIcon channel={channel} className="size-6" />
                            </span>
                          ) : (
                            <span key={channel} className="text-xs text-slate-500">
                              {channel}
                            </span>
                          ),
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">No templates</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">{b.priority || "—"}</TableCell>
                  <TableCell>
                    <Badge className={bombStatusClass(b.status)}>{b.status}</Badge>
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon-sm" variant="ghost">
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => router.push(bombPath(b.id))}>
                          Open
                        </DropdownMenuItem>
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
              <EmptyTitle>No OmniReach here</EmptyTitle>
              <EmptyDescription>
                No matching records in Follow-up OmniReach.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </div>
      <NewBombDialog
        open={create}
        onOpenChange={setCreate}
        scenarios={scenarios}
        cps={listApplicableCps()}
        onCreated={(id) => router.push(bombPath(id))}
      />
    </div>
  );
}

function NewBombDialog({
  open,
  onOpenChange,
  scenarios,
  cps,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scenarios: BombScenario[];
  cps: CurrentCpOption[];
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [scenarioId, setScenarioId] = useState("");
  const [cpId, setCpId] = useState("");
  const [saving, setSaving] = useState(false);
  const scenario = scenarios.find((item) => item.id === scenarioId);
  const reset = () => {
    setName("");
    setScenarioId("");
    setCpId("");
  };
  const submit = async () => {
    if (!name.trim() || !scenarioId || !cpId || saving) return;
    setSaving(true);
    try {
      const response = await fetch("/api/bombs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          scenarioId,
          cpIds: [cpId],
          targetRole: "Connector",
          priority: "P1",
        }),
      });
      const payload = (await response.json()) as { bomb?: BombDetail; error?: string };
      if (!response.ok) throw new Error(payload.error || "Failed to create OmniReach");
      if (!payload.bomb) throw new Error("OmniReach was not created");
      toast.success("OmniReach draft created");
      onOpenChange(false);
      reset();
      onCreated(payload.bomb.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create OmniReach");
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="overflow-visible sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New OmniReach</DialogTitle>
          <DialogDescription>
            Start a Draft, then edit the full flow on the next page.
          </DialogDescription>
        </DialogHeader>
        <label className="grid gap-2 text-sm font-medium">
          Name
          <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="OmniReach name" />
        </label>
        <div className="grid gap-2 text-sm font-medium">
          Scenario
          <Select value={scenarioId || undefined} onValueChange={setScenarioId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select a scenario" />
            </SelectTrigger>
            <SelectContent position="popper">
              {scenarios.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {scenario?.description ? <p className="text-xs text-slate-500">{scenario.description}</p> : null}
        {!scenarios.length ? (
          <p className="text-xs text-amber-700">No Scenarios in Notion yet. Create one in Follow-up ScenarioDB first.</p>
        ) : null}
        <div className="grid gap-2 text-sm font-medium">
          Applicable CP
          <Select value={cpId || undefined} onValueChange={setCpId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select a CP" />
            </SelectTrigger>
            <SelectContent position="popper">
              {cps.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!name.trim() || !scenarioId || !cpId || saving} onClick={submit}>
            {saving ? "Creating…" : "Create draft"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function BombDetailPage({ bombId }: { bombId: string }) {
  const router = useRouter();
  const [bomb, setBomb] = useState<BombDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/bombs/${bombId}`)
      .then(async (response) => {
        const payload = (await response.json()) as {
          bomb?: BombDetail;
          error?: string;
        };
        if (!response.ok) throw new Error(payload.error || "Failed to load OmniReach");
        if (!payload.bomb) throw new Error("OmniReach not found");
        return payload.bomb;
      })
      .then((item) => {
        if (cancelled) return;
        setBomb(item);
        setError(undefined);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setBomb(null);
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
          title: [bomb.name, bomb.cp, bomb.status].filter(Boolean).join(" · "),
          description: bomb.goal || "Follow-up OmniReach details from Notion.",
        }
      : {
          title: error ? "OmniReach not found" : "OmniReach",
          description: error || "Loading Follow-up OmniReach details.",
        },
  );
  if (loading) {
    return (
      <div className="grid min-h-[60vh] place-items-center text-sm text-slate-500">
        Loading OmniReach…
      </div>
    );
  }
  if (!bomb || error) {
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
  return (
    <div className="mx-auto max-w-[1480px]">
      <button
        onClick={() => router.push("/bombs")}
        className="mb-5 flex items-center gap-2 text-sm font-semibold text-slate-500"
      >
        <ArrowLeft className="size-4" />
        OmniReach
      </button>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Status value={bomb.status} />
            {bomb.priority ? <Status value={bomb.priority} /> : null}
            {bomb.targetRole ? <Badge variant="outline">{bomb.targetRole}</Badge> : null}
          </div>
          <h1 className="mt-3 text-2xl font-bold tracking-tight">{bomb.name}</h1>
          {bomb.goal ? <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{bomb.goal}</p> : null}
        </div>
      </div>
      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <main className="space-y-6">
          <section className="rounded-2xl bg-white p-5">
            <h2 className="font-bold">Basic settings</h2>
            <div className="mt-5 grid gap-5 md:grid-cols-2">
              <Field label="Applicable CP">
                {bomb.cps.length ? (
                  <div className="space-y-2">
                    {bomb.cps.map((cp) => (
                      <div key={cp.id}>
                        <CP value={cp.name} />
                        {cp.fullName ? (
                          <p className="mt-1 text-xs text-slate-500">{cp.fullName}</p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  "—"
                )}
              </Field>
              <Field label="Priority">{bomb.priority || "—"}</Field>
              <Field label="Scenario">
                <div>{bomb.scenarioName || "—"}</div>
                {bomb.scenarioDescription ? (
                  <p className="mt-1 text-xs leading-5 text-slate-500">{bomb.scenarioDescription}</p>
                ) : null}
              </Field>
              <Field label="Target role">{bomb.targetRole || "—"}</Field>
              {bomb.notes ? (
                <div className="md:col-span-2">
                  <Field label="Notes">
                    <p className="whitespace-pre-wrap leading-6">{bomb.notes}</p>
                  </Field>
                </div>
              ) : null}
            </div>
          </section>
          <section className="rounded-2xl bg-white p-5">
            <div>
              <h2 className="font-bold">Templates</h2>
              <p className="mt-1 text-xs text-slate-500">
                Content comes from Follow-up TemplateDB. Sequence is assigned when tasks are created.
              </p>
            </div>
            <div className="mt-5 space-y-4">
              {bomb.templates.length ? (
                bomb.templates.map((template, index) => (
                  <TemplateCard key={template.id} template={template} index={index} />
                ))
              ) : (
                <Empty className="py-12">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Bomb />
                    </EmptyMedia>
                    <EmptyTitle>No templates</EmptyTitle>
                    <EmptyDescription>
                      This OmniReach has no related templates in Notion yet.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
            </div>
          </section>
        </main>
        <aside className="space-y-5">
          <section className="sticky top-24 rounded-2xl bg-slate-950 p-5 text-white">
            <div className="text-xs font-semibold uppercase tracking-wide text-violet-300">
              Channel flow
            </div>
            <h2 className="mt-1 font-bold">{bomb.name}</h2>
            <div className="mt-6 space-y-5">
              {bomb.templates.length ? (
                bomb.templates.map((template, index) => (
                  <div key={template.id} className="flex gap-3">
                    <span className="grid size-8 shrink-0 place-items-center">
                      {isBombChannel(template.channel) ? (
                        <ChannelIcon channel={template.channel} className="size-6" />
                      ) : (
                        <span className="text-xs text-slate-400">{index + 1}</span>
                      )}
                    </span>
                    <div className="min-w-0">
                      <div className="text-[10px] font-semibold uppercase text-slate-500">
                        Template {index + 1}
                      </div>
                      <div className="text-sm font-semibold">{template.channel || "Unknown channel"}</div>
                      <div className="truncate text-xs text-slate-400">{template.name}</div>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-400">No related templates.</p>
              )}
            </div>
            <div className="mt-6 space-y-1 rounded-xl bg-white/5 p-4 text-xs leading-5 text-slate-400">
              <div>Created {formatWhen(bomb.createdAt)}</div>
              <div>Updated {formatWhen(bomb.lastEditedAt)}</div>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

export { BombEditor } from "./workspace-bomb-editor";
