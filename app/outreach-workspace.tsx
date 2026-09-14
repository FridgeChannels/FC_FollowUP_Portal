"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Bomb, ChevronDown, ClipboardCheck, LogOut,
  Settings, Users, Zap,
} from "lucide-react";
import type { BrandTask } from "@/lib/brand-list";
import { isClosedTaskStatus, Role } from "@/lib/outreach-domain";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton,
  SidebarMenuItem, SidebarProvider, SidebarRail,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { Toaster } from "@/components/ui/sonner";
import { useWorkspace } from "./workspace-store";
import { BrandsPage } from "./workspace-pages";
import { BrandDetail } from "./workspace-customer";
import { TasksPage } from "./workspace-tasks";
import { BombEditor, BombsPage } from "./workspace-bombs";
import { SettingsPage } from "./workspace-admin";
import { useSession } from "./use-session";

type Screen = "Brands" | "ReplyTask" | "OmniReach" | "Settings";
const nav: { label: Screen; path: string; icon: typeof Users; cap: string; badge?: boolean }[] = [
  { label: "Brands", path: "/customers", icon: Users, cap: "customers" },
  { label: "ReplyTask", path: "/tasks", icon: ClipboardCheck, cap: "tasks", badge: true },
  { label: "OmniReach", path: "/bombs", icon: Bomb, cap: "bombs" },
];
const roleHome: Record<Role, string> = {
  Admin: "/tasks",
  "FC_Owner": "/customers",
  Caller: "/tasks",
};
const routeScreen = (path: string): Screen => path.startsWith("/customers") ? "Brands" : path.startsWith("/bombs") ? "OmniReach" : path.startsWith("/settings") ? "Settings" : "ReplyTask";
const accountInitials = (name?: string | null, email?: string | null) => {
  const source = name?.trim() || email?.split("@")[0] || "?";
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return source.slice(0, 2).toUpperCase();
};

export default function OutreachWorkspace() {
  const router = useRouter();
  const pathname = usePathname();
  const { state, hydrated, can, setRole } = useWorkspace();
  const { user, loading: sessionLoading, signOut } = useSession();
  const screen = routeScreen(pathname);
  const [remoteCounts, setRemoteCounts] = useState<{ open: number; needsReply: number } | null>(null);
  const taskCount = remoteCounts?.open ?? 0;
  const replyCount = remoteCounts?.needsReply ?? 0;

  useEffect(() => {
    if (sessionLoading) return;
    if (!user) {
      const returnTo = pathname === "/" ? "/login" : `/login?return_to=${encodeURIComponent(pathname)}`;
      router.replace(returnTo);
    }
  }, [sessionLoading, user, pathname, router]);

  useEffect(() => {
    if (user && state.currentRole !== user.role) setRole(user.role);
  }, [user, state.currentRole, setRole]);

  useEffect(() => {
    if (sessionLoading || !user) return;
    let cancelled = false;
    fetch("/api/tasks")
      .then(async (response) => {
        const payload = await response.json() as { tasks?: BrandTask[] };
        if (!response.ok) throw new Error("Failed to load tasks");
        return payload.tasks || [];
      })
      .then((tasks) => {
        if (cancelled) return;
        setRemoteCounts({
          open: tasks.filter((item) => item.inboxStatus === "Needs Reply" || (item.channel === "Phone" && !isClosedTaskStatus(item.status || ""))).length,
          needsReply: tasks.filter((item) => item.inboxStatus === "Needs Reply").length,
        });
      })
      .catch(() => {
        if (!cancelled) setRemoteCounts({ open: 0, needsReply: 0 });
      });
    return () => { cancelled = true; };
  }, [sessionLoading, user, pathname]);

  useEffect(() => {
    if (sessionLoading || !user) return;
    if (pathname === "/") {
      router.replace(roleHome[state.currentRole]);
      return;
    }
    if (pathname.startsWith("/dashboard")) {
      router.replace(roleHome[state.currentRole]);
      return;
    }
    if (pathname.startsWith("/inbox") || pathname.startsWith("/call-tasks")) {
      router.replace(state.currentRole === "FC_Owner" ? "/customers" : pathname.replace(/^\/(inbox|call-tasks)/, "/tasks"));
      return;
    }
    const capability = screen === "Brands" ? "customers" : screen === "ReplyTask" ? "tasks" : screen === "OmniReach" ? "bombs" : screen.toLowerCase();
    if (!can(capability)) router.replace(roleHome[state.currentRole]);
  }, [sessionLoading, user, pathname, screen, state.currentRole, can, router]);

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

  if (!hydrated || sessionLoading || !user) return <div className="grid min-h-screen grid-cols-[250px_1fr]"><div className="bg-slate-950"/><div className="space-y-5 p-8"><Skeleton className="h-10 w-64"/><div className="grid grid-cols-4 gap-4">{[1, 2, 3, 4].map(value => <Skeleton key={value} className="h-32 rounded-2xl"/>)}</div><Skeleton className="h-96 rounded-2xl"/></div></div>;
  const displayName = user.name || user.email;

  return <SidebarProvider defaultOpen>
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="border-b border-white/8 px-3 py-4"><button onClick={() => router.push(roleHome[state.currentRole])} className="flex items-center gap-3 px-1 text-left"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-violet-500 text-white shadow-[0_8px_24px_rgb(113_106_255/35%)]"><Zap className="size-4 fill-current"/></span><span className="min-w-0 group-data-[collapsible=icon]:hidden"><span className="block truncate text-sm font-bold text-white">Outreach Control</span><span className="block truncate text-[11px] text-slate-400">FC Operations</span></span></button></SidebarHeader>
      <SidebarContent className="px-2 py-3"><SidebarGroup><SidebarGroupLabel className="text-[10px] uppercase tracking-[.16em] text-slate-500">Workspace</SidebarGroupLabel><SidebarGroupContent><SidebarMenu>{nav.filter(item => can(item.cap)).map(item => { const count = item.label === "Brands" && state.currentRole === "FC_Owner" ? replyCount : item.badge ? taskCount : 0; return <SidebarMenuItem key={item.path}><SidebarMenuButton tooltip={item.label} isActive={screen === item.label} onClick={() => router.push(item.path)} className={`h-10 rounded-lg px-3 text-[13px] font-medium ${item.label === "Brands" ? "data-[active=true]:bg-blue-500" : item.label === "ReplyTask" ? "data-[active=true]:bg-violet-500" : "data-[active=true]:bg-amber-500"} data-[active=true]:text-white`}><item.icon/><span>{item.label}</span>{count>0 && <span className={`ml-auto rounded-md px-1.5 py-0.5 text-[10px] group-data-[collapsible=icon]:hidden ${item.label === "Brands" ? "bg-rose-500/20 text-rose-200" : "bg-amber-400/20 text-amber-200"}`}>{count}</span>}</SidebarMenuButton></SidebarMenuItem>})}</SidebarMenu></SidebarGroupContent></SidebarGroup></SidebarContent>
      <SidebarFooter className="border-t border-white/8 p-3">
        {can("settings") && <SidebarMenu><SidebarMenuItem><SidebarMenuButton tooltip="Settings" isActive={screen === "Settings"} onClick={() => router.push("/settings")}><Settings/><span>Settings</span></SidebarMenuButton></SidebarMenuItem></SidebarMenu>}
        <DropdownMenu><DropdownMenuTrigger asChild><button className="mt-2 flex w-full items-center gap-3 rounded-xl bg-white/[.04] p-2 text-left"><Avatar className="size-8"><AvatarFallback className="bg-violet-200 text-xs font-bold text-violet-800">{accountInitials(user.name, user.email)}</AvatarFallback></Avatar><span className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden"><span className="block truncate text-xs font-semibold text-white">{displayName}</span><span className="block truncate text-[10px] text-slate-400">{user.role}</span></span><ChevronDown className="size-3 text-slate-500 group-data-[collapsible=icon]:hidden"/></button></DropdownMenuTrigger><DropdownMenuContent side="right" align="end" className="w-64"><DropdownMenuLabel className="space-y-0.5 font-normal"><span className="block truncate text-sm font-semibold">{displayName}</span><span className="block truncate text-xs text-muted-foreground">{user.email}</span></DropdownMenuLabel><DropdownMenuSeparator/><DropdownMenuItem onClick={async () => { await signOut(); router.replace("/login"); }}> <LogOut className="size-4"/>Sign out</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
      </SidebarFooter>
      <SidebarRail/>
    </Sidebar>
    <SidebarInset className="min-w-0 bg-[#f7f8fc]">
      <main className="min-h-svh p-4 sm:p-6 lg:p-8"><RouteContent/></main>
    </SidebarInset>
    <Toaster richColors position="bottom-right"/>
  </SidebarProvider>;
}

function RouteContent() {
  const path = usePathname();
  const parts = path.split("/").filter(Boolean);
  if (parts[0] === "customers" && parts[1]) return <BrandDetail customerId={parts[1]}/>;
  if (parts[0] === "tasks" || parts[0] === "inbox" || parts[0] === "call-tasks") return <TasksPage selectedId={parts[1]}/>;
  if (parts[0] === "bombs" && parts[1]) return <BombEditor bombId={parts[1]}/>;
  if (parts[0] === "bombs") return <BombsPage/>;
  if (parts[0] === "customers") return <BrandsPage/>;
  if (parts[0] === "settings") return <SettingsPage section={parts[1]}/>;
  return <TasksPage/>;
}
