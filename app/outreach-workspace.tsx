"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell, Bomb, Check, ChevronDown, ClipboardCheck,
  Settings, Users, Zap,
} from "lucide-react";
import { toast } from "sonner";
import { dateOnly, Role } from "@/lib/outreach-domain";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton,
  SidebarMenuItem, SidebarProvider, SidebarRail, SidebarTrigger,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { Toaster } from "@/components/ui/sonner";
import { useWorkspace } from "./workspace-store";
import { BrandsPage } from "./workspace-pages";
import { BrandDetail } from "./workspace-customer";
import { TasksPage } from "./workspace-tasks";
import { BombEditor, BombsPage } from "./workspace-bombs";
import { SettingsPage } from "./workspace-admin";

type Screen = "Brands" | "Tasks" | "Bombs" | "Settings";
const nav: { label: Screen; path: string; icon: typeof Users; cap: string; badge?: boolean }[] = [
  { label: "Brands", path: "/customers", icon: Users, cap: "customers" },
  { label: "Tasks", path: "/tasks", icon: ClipboardCheck, cap: "tasks", badge: true },
  { label: "Bombs", path: "/bombs", icon: Bomb, cap: "bombs" },
];
const roleHome: Record<Role, string> = {
  Admin: "/tasks",
  "Outreach Manager": "/tasks",
  "Human Responder": "/tasks",
  Caller: "/tasks",
  Viewer: "/customers",
};
const routeScreen = (path: string): Screen => path.startsWith("/customers") ? "Brands" : path.startsWith("/bombs") ? "Bombs" : path.startsWith("/settings") ? "Settings" : "Tasks";

export default function OutreachWorkspace() {
  const router = useRouter();
  const pathname = usePathname();
  const { state, hydrated, can, setRole } = useWorkspace();
  const screen = routeScreen(pathname);
  const actionableReplies = state.inbox.filter(item => item.status === "Needs Reply").length;
  const callsToday = state.callTasks.filter(task => dateOnly(task.scheduledDate) === dateOnly(state.simulatedDate) && task.status === "Scheduled").length;
  const dueFollowUps = state.followUps.filter(item => item.status === "Due").length;
  const taskCount = actionableReplies + callsToday + dueFollowUps;

  useEffect(() => {
    if (pathname === "/") {
      router.replace(roleHome[state.currentRole]);
      return;
    }
    if (pathname.startsWith("/dashboard")) {
      router.replace("/tasks");
      return;
    }
    if (pathname.startsWith("/inbox") || pathname.startsWith("/call-tasks")) {
      router.replace(pathname.replace(/^\/(inbox|call-tasks)/, "/tasks"));
      return;
    }
    const capability = screen === "Brands" ? "customers" : screen.toLowerCase();
    if (!can(capability)) router.replace(roleHome[state.currentRole]);
  }, [pathname, screen, state.currentRole, can, router]);

  useEffect(() => {
    const context = (document as Document & { modelContext?: { registerTool: (tool: object, options?: { signal?: AbortSignal }) => void | Promise<void> } }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    try {
      void Promise.resolve(context.registerTool({
        name: "navigate_outreach_workspace",
        title: "Navigate workspace",
        description: "Open a primary Outreach Control workspace.",
        inputSchema: { type: "object", properties: { path: { type: "string", enum: ["/customers", "/tasks", "/bombs", "/settings"] } }, required: ["path"], additionalProperties: false },
        annotations: { readOnlyHint: true, untrustedContentHint: false },
        execute(input: unknown) {
          const path = (input as { path?: string }).path;
          if (!path) throw new Error("Path required");
          router.push(path);
          return { path };
        },
      }, { signal: lifecycle.signal })).catch(() => undefined);
    } catch {}
    return () => lifecycle.abort();
  }, [router]);

  if (!hydrated) return <div className="grid min-h-screen grid-cols-[250px_1fr]"><div className="bg-slate-950"/><div className="space-y-5 p-8"><Skeleton className="h-10 w-64"/><div className="grid grid-cols-4 gap-4">{[1, 2, 3, 4].map(value => <Skeleton key={value} className="h-32 rounded-2xl"/>)}</div><Skeleton className="h-96 rounded-2xl"/></div></div>;
  const current = state.users.find(user => user.id === state.currentUserId);

  return <SidebarProvider defaultOpen>
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="border-b border-white/8 px-3 py-4"><button onClick={() => router.push(roleHome[state.currentRole])} className="flex items-center gap-3 px-1 text-left"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-violet-500 text-white shadow-[0_8px_24px_rgb(113_106_255/35%)]"><Zap className="size-4 fill-current"/></span><span className="min-w-0 group-data-[collapsible=icon]:hidden"><span className="block truncate text-sm font-bold text-white">Outreach Control</span><span className="block truncate text-[11px] text-slate-400">FC Operations</span></span></button></SidebarHeader>
      <SidebarContent className="px-2 py-3"><SidebarGroup><SidebarGroupLabel className="text-[10px] uppercase tracking-[.16em] text-slate-500">Workspace</SidebarGroupLabel><SidebarGroupContent><SidebarMenu>{nav.filter(item => can(item.cap)).map(item => <SidebarMenuItem key={item.path}><SidebarMenuButton tooltip={item.label} isActive={screen === item.label} onClick={() => router.push(item.path)} className="h-10 rounded-lg px-3 text-[13px] font-medium data-[active=true]:bg-violet-500 data-[active=true]:text-white"><item.icon/><span>{item.label}</span>{item.badge && <span className="ml-auto rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] group-data-[collapsible=icon]:hidden">{taskCount}</span>}</SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu></SidebarGroupContent></SidebarGroup></SidebarContent>
      <SidebarFooter className="border-t border-white/8 p-3">
        {can("settings") && <SidebarMenu><SidebarMenuItem><SidebarMenuButton tooltip="Settings" isActive={screen === "Settings"} onClick={() => router.push("/settings")}><Settings/><span>Settings</span></SidebarMenuButton></SidebarMenuItem></SidebarMenu>}
        <DropdownMenu><DropdownMenuTrigger asChild><button className="mt-2 flex w-full items-center gap-3 rounded-xl bg-white/[.04] p-2 text-left"><Avatar className="size-8"><AvatarFallback className="bg-violet-200 text-xs font-bold text-violet-800">{current?.initials || "SC"}</AvatarFallback></Avatar><span className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden"><span className="block truncate text-xs font-semibold text-white">{current?.name || "Sarah Chen"}</span><span className="block truncate text-[10px] text-slate-400">{state.currentRole}</span></span><ChevronDown className="size-3 text-slate-500 group-data-[collapsible=icon]:hidden"/></button></DropdownMenuTrigger><DropdownMenuContent side="right" align="end" className="w-56"><DropdownMenuLabel>Switch demo role</DropdownMenuLabel>{(["Admin", "Outreach Manager", "Human Responder", "Caller", "Viewer"] as Role[]).map(role => <DropdownMenuItem key={role} onClick={() => { setRole(role); router.push(roleHome[role]); toast.success(`Switched to ${role}`); }}>{state.currentRole === role && <Check className="mr-2 size-4"/>}<span className={state.currentRole === role ? "font-semibold" : "ml-6"}>{role}</span></DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>
      </SidebarFooter>
      <SidebarRail/>
    </Sidebar>
    <SidebarInset className="min-w-0 bg-[#f4f6fa]">
      <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-slate-200/80 bg-white/90 px-4 backdrop-blur-xl sm:px-6"><SidebarTrigger className="-ml-1"/><div className="h-5 w-px bg-slate-200"/><span className="text-sm font-semibold text-slate-900">{screen}</span><span className="hidden text-xs text-slate-400 sm:inline">Demo date · {dateOnly(state.simulatedDate)}</span><div className="ml-auto flex items-center gap-2"><Button variant="ghost" size="icon" aria-label="Notifications"><Bell className="size-4"/></Button></div></header>
      <main className="min-h-[calc(100vh-4rem)] p-4 sm:p-6 lg:p-8"><RouteContent/></main>
    </SidebarInset>
    <Toaster richColors position="bottom-right"/>
  </SidebarProvider>;
}

function RouteContent() {
  const path = usePathname();
  const parts = path.split("/").filter(Boolean);
  if (parts[0] === "customers" && parts[1]) return <BrandDetail customerId={parts[1]}/>;
  if (parts[0] === "tasks" || parts[0] === "inbox" || parts[0] === "call-tasks") return <TasksPage selectedId={parts[1]}/>;
  if (parts[0] === "bombs" && parts[1] && parts[2] === "edit") return <BombEditor bombId={parts[1]}/>;
  if (parts[0] === "bombs") return <BombsPage/>;
  if (parts[0] === "customers") return <BrandsPage/>;
  if (parts[0] === "settings") return <SettingsPage section={parts[1]}/>;
  return <TasksPage/>;
}
