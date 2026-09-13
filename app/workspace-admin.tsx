"use client";

import { useState } from "react";
import { Link2 } from "lucide-react";
import { toast } from "sonner";
import { dateOnly } from "@/lib/outreach-domain";
import { useWorkspace } from "./workspace-store";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const show = (result: { ok: boolean; message: string }) => result.ok ? toast.success(result.message) : toast.error(result.message);

export function SettingsPage({ section }: { section?: string }) {
  const { state, can, updateCallerCapacity, updateIntegration } = useWorkspace();
  const [tab, setTab] = useState(section || "channels");
  const tabs = ["channels", "capacity", "permissions", "audit"];
  const permissionRows = [
    ["Admin", "Brands, Tasks, Bombs, Settings", "All actions"],
    ["Outreach Manager", "Brands, Tasks and Bombs", "Manage outreach"],
    ["Human Responder", "Brands and assigned Tasks", "Reply, follow-up, CP and launch"],
    ["Caller", "Assigned Call Tasks", "Submit call outcomes"],
    ["Viewer", "Brands", "Read-only"],
  ];

  return <div className="mx-auto max-w-[1300px]">
    <div className="mb-6"><div className="text-xs font-semibold uppercase tracking-[.14em] text-violet-600">Administration</div><h1 className="mt-1 text-2xl font-bold">Settings</h1></div>
    <Tabs value={tab} onValueChange={setTab}><TabsList>{tabs.map(value => <TabsTrigger value={value} key={value} className="capitalize">{value}</TabsTrigger>)}</TabsList></Tabs>
    <div className="mt-5">
      {tab === "channels" && <section className="overflow-hidden rounded-2xl border bg-white"><div className="border-b p-5"><h2 className="font-bold">Channel integrations</h2><p className="text-xs text-slate-500">Mock connection states only; no real provider calls are made.</p></div><div className="divide-y">{state.integrations.map(integration => <div key={integration.channel} className="flex flex-wrap items-center justify-between gap-4 p-5"><div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-xl bg-slate-100"><Link2 className="size-4"/></div><div><b className="text-sm">{integration.channel}</b><div className="text-xs text-slate-500">{integration.account}</div></div></div><Select disabled={!can("settings")} value={integration.status} onValueChange={value => show(updateIntegration(integration.channel, value as typeof integration.status))}><SelectTrigger className="w-44"><SelectValue/></SelectTrigger><SelectContent>{["Connected", "Needs Attention", "Disconnected"].map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>)}</div></section>}

      {tab === "capacity" && <section className="rounded-2xl border bg-white p-5"><h2 className="font-bold">Daily call capacity</h2><p className="text-xs text-slate-500">Phone tasks share the Tasks queue, while the scheduler still respects each Caller&apos;s daily limit.</p><Table className="mt-5"><TableHeader><TableRow><TableHead>Caller</TableHead><TableHead>Working days</TableHead><TableHead>Today</TableHead><TableHead>Daily limit</TableHead></TableRow></TableHeader><TableBody>{state.users.filter(user => user.role === "Caller").map(user => { const used = state.callTasks.filter(task => task.callerId === user.id && dateOnly(task.scheduledDate) === dateOnly(state.simulatedDate) && task.status !== "Cancelled").length; return <TableRow key={user.id}><TableCell className="font-semibold">{user.name}</TableCell><TableCell className="text-xs">Mon–Fri</TableCell><TableCell><Badge variant="secondary">{used}/{user.dailyCapacity}</Badge></TableCell><TableCell><Input type="number" className="w-24" defaultValue={user.dailyCapacity} onBlur={event => show(updateCallerCapacity(user.id, Number(event.target.value)))}/></TableCell></TableRow>; })}</TableBody></Table></section>}

      {tab === "permissions" && <section className="rounded-2xl border bg-white p-5"><h2 className="font-bold">Role permissions</h2><p className="text-xs text-slate-500">Everyone works from the same Tasks page; role and assignment determine the default queue.</p><Table className="mt-5"><TableHeader><TableRow><TableHead>Role</TableHead><TableHead>Primary access</TableHead><TableHead>Mutation scope</TableHead></TableRow></TableHeader><TableBody>{permissionRows.map(row => <TableRow key={row[0]}><TableCell className="font-semibold">{row[0]}</TableCell><TableCell className="text-sm">{row[1]}</TableCell><TableCell className="text-sm text-slate-500">{row[2]}</TableCell></TableRow>)}</TableBody></Table></section>}

      {tab === "audit" && <section className="overflow-hidden rounded-2xl border bg-white"><div className="border-b p-5"><h2 className="font-bold">Audit history</h2><p className="text-xs text-slate-500">Every meaningful change is recorded.</p></div><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead className="pl-5">Time</TableHead><TableHead>User</TableHead><TableHead>Action</TableHead><TableHead>Brand</TableHead><TableHead>Change</TableHead></TableRow></TableHeader><TableBody>{state.audit.map(entry => <TableRow key={entry.id}><TableCell className="pl-5 text-xs">{dateOnly(entry.createdAt)}</TableCell><TableCell className="text-xs">{state.users.find(user => user.id === entry.actorId)?.name || entry.actorId}</TableCell><TableCell className="font-medium">{entry.action}</TableCell><TableCell className="text-xs">{state.customers.find(customer => customer.id === entry.customerId)?.name || "—"}</TableCell><TableCell className="max-w-xs truncate text-xs text-slate-500">{entry.previousValue && `${entry.previousValue} → `}{entry.newValue || "—"}</TableCell></TableRow>)}</TableBody></Table></div></section>}
    </div>
  </div>;
}
