"use client";

import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { portalExit, portalNavigate } from "@/app/portal-navigate";
import {
  Bomb, ChevronDown, ClipboardCheck, LayoutDashboard, LogOut, RefreshCw,
  Users, Radio, ChartNoAxesCombined,
} from "lucide-react";
import { toast } from "sonner";
import { Role } from "@/lib/outreach-domain";
import { clearBrandListPageCache } from "@/lib/brand-list-cache";
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
import { SignalsProvider, useSignals } from "./signals-store";
import { SignalsPage } from "./workspace-signals";
import { SampleManagementPage } from "./sample-management";
import { TasksPage } from "./workspace-tasks";
import { BombEditor, BombsPage } from "./workspace-bombs";
import { useSession } from "./use-session";
import { QualifiedCallsDashboard } from "./qualified-calls-dashboard";
import { PerformancePages } from "./performance/performance-pages";

type Screen = "Dashboard" | "Caller Dashboard" | "Performance" | "Brands" | "Signals" | "ReplyTask" | "OmniReach";
type NavigationItem = { label: string; screen: Screen; path: string; icon: typeof Users; cap: string; badge?: boolean; adminOnly?: boolean };

const performanceNav: NavigationItem[] = [
  { label: "Exhibition Performance", screen: "Performance", path: "/performance", icon: ChartNoAxesCombined, cap: "dashboard", adminOnly: true },
  { label: "Caller Performance", screen: "Dashboard", path: "/dashboard", icon: LayoutDashboard, cap: "dashboard" },
];
const followUpNav: NavigationItem[] = [
  { label: "Brands", screen: "Brands", path: "/customers", icon: Users, cap: "customers" },
  { label: "Signals", screen: "Signals", path: "/signals", icon: Radio, cap: "customers" },
  { label: "Reply Tasks", screen: "ReplyTask", path: "/tasks", icon: ClipboardCheck, cap: "tasks", badge: true },
];
const resourceNav: NavigationItem[] = [
  { label: "OmniReach Templates", screen: "OmniReach", path: "/omnireach", icon: Bomb, cap: "bombs" },
];
const roleHome: Record<Role, string> = {
  Admin: "/dashboard",
  "AccountManager": "/customers?view=myWork",
  Caller: "/dashboard",
};
const isOmniReachPath = (path: string) => /^\/(omnireach|bombs)(\/|$)/i.test(path);
const routeScreen = (path: string): Screen => path.startsWith("/performance") ? "Performance" : path.startsWith("/signals") ? "Signals" : path.startsWith("/dashboard") ? "Dashboard" : path.startsWith("/customers") ? "Brands" : isOmniReachPath(path) ? "OmniReach" : "ReplyTask";
const accountInitials = (name?: string | null, email?: string | null) => {
  const source = name?.trim() || email?.split("@")[0] || "?";
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return source.slice(0, 2).toUpperCase();
};

export default function OutreachWorkspace({ children }: { children?: ReactNode }) {
  return <SignalsProvider><WorkspaceShell>{children}</WorkspaceShell></SignalsProvider>;
}

function isModifiedClick(event: MouseEvent) {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;
}

function WorkspaceShell({ children }: { children?: ReactNode }) {
  const { data: signalsData } = useSignals();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { state, hydrated, can, setRole } = useWorkspace();
  const { user, loading: sessionLoading, signOut } = useSession();
  const screen = routeScreen(pathname);
  const [taskCount, setTaskCount] = useState(0);
  const [brandReplyCount, setBrandReplyCount] = useState(0);
  const [clearingCache, setClearingCache] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(() => !/^\/customers\/[^/]+/.test(pathname));
  const isBrandDetailPath = /^\/customers\/[^/]+/.test(pathname);
  const isAdmin = user?.role === "Admin" || state.currentRole === "Admin";

  useEffect(() => {
    setSidebarOpen(!/^\/customers\/[^/]+/.test(pathname));
  }, [pathname]);

  useEffect(() => {
    if (sessionLoading) return;
    if (!user) {
      const returnTo = pathname === "/" ? "/login" : `/login?return_to=${encodeURIComponent(pathname)}`;
      portalExit(returnTo);
    }
  }, [sessionLoading, user, pathname]);

  useEffect(() => {
    if (user && state.currentRole !== user.role) setRole(user.role);
  }, [user, state.currentRole, setRole]);

  useEffect(() => {
    // A task detail loads its own Notion data. Avoid competing with that request
    // merely to refresh the sidebar count.
    if (sessionLoading || !user || !can("tasks") || /^\/tasks\/[^/]+/.test(pathname)) return;
    let cancelled = false;
    fetch("/api/tasks/summary")
      .then(async (response) => {
        const payload = await response.json() as { openCount?: number; error?: string };
        if (!response.ok) throw new Error(payload.error || "Failed to load task summary");
        return payload.openCount || 0;
      })
      .then((openCount) => {
        if (!cancelled) setTaskCount(openCount);
      })
      .catch(() => {
        if (!cancelled) setTaskCount(0);
      });
    return () => { cancelled = true; };
  }, [sessionLoading, user?.email, user?.role, can, pathname]);

  useEffect(() => {
    // Brand summary is also a Notion-wide query. Keep it off the critical path
    // when a task detail is loading its selected call.
    if (sessionLoading || !user || !can("customers") || /^\/tasks\/[^/]+/.test(pathname)) return;
    let cancelled = false;
    fetch("/api/brands/summary")
      .then(async (response) => {
        const payload = await response.json() as {
          needsReplyBrandCount?: number;
          error?: string;
        };
        if (!response.ok) throw new Error(payload.error || "Failed to load brand summary");
        return payload.needsReplyBrandCount || 0;
      })
      .then((count) => {
        if (!cancelled) setBrandReplyCount(count);
      })
      .catch(() => {
        if (!cancelled) setBrandReplyCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionLoading, user?.email, user?.role, can, pathname]);

  useEffect(() => {
    if (sessionLoading || !user) return;
    if (pathname === "/") {
      portalNavigate(roleHome[state.currentRole], "replace");
      return;
    }
    if (pathname.startsWith("/settings")) {
      portalNavigate(roleHome[state.currentRole], "replace");
      return;
    }
    if (pathname.startsWith("/inbox") || pathname.startsWith("/call-tasks")) {
      portalNavigate(state.currentRole === "AccountManager" ? "/customers?view=myWork" : pathname.replace(/^\/(inbox|call-tasks)/, "/tasks"), "replace");
      return;
    }
    if (/^\/bombs(\/|$)/i.test(pathname)) {
      portalNavigate(pathname.replace(/^\/bombs/i, "/omnireach"), "replace");
      return;
    }
    const brandDetail = /^\/customers\/[^/]+/.test(pathname);
    if (screen === "Performance") {
      if (user.role !== "Admin") portalNavigate(roleHome[state.currentRole], "replace");
      return;
    }
    if (brandDetail) {
      if (!can("customers")) portalNavigate(roleHome[state.currentRole], "replace");
      return;
    }
    const capability = screen === "Dashboard" ? "dashboard" : (screen === "Brands" || screen === "Signals") ? "customers" : screen === "ReplyTask" ? "tasks" : "bombs";
    if (!can(capability)) portalNavigate(roleHome[state.currentRole], "replace");
  }, [sessionLoading, user, pathname, screen, state.currentRole, can]);

  useEffect(() => {
    const context = (document as Document & { modelContext?: { registerTool: (tool: object, options?: { signal?: AbortSignal }) => void | Promise<void> } }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    try {
      void Promise.resolve(context.registerTool({
        name: "navigate_outreach_workspace",
        title: "Navigate workspace",
        description: "Open a primary Super FollowUP workspace.",
        inputSchema: { type: "object", properties: { path: { type: "string", enum: ["/dashboard", "/performance", "/customers", "/signals", "/tasks", "/omnireach"] } }, required: ["path"], additionalProperties: false },
        annotations: { readOnlyHint: true, untrustedContentHint: false },
        execute(input: unknown) {
          const path = (input as { path?: string }).path;
          if (!path) throw new Error("Path required");
          portalNavigate(path);
          return { path };
        },
      }, { signal: lifecycle.signal })).catch(() => undefined);
    } catch {}
    return () => lifecycle.abort();
  }, []);

  if (!hydrated || sessionLoading || !user) {
    return (
      <div className="grid min-h-screen grid-cols-[250px_1fr]">
        <div className="bg-slate-950" />
        <div className="space-y-5 p-8">
          <Skeleton className="h-10 w-64" />
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((value) => (
              <Skeleton key={value} className="h-32 rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-96 rounded-2xl" />
        </div>
      </div>
    );
  }
  const displayName = user.name || user.email;
  const visibleItems = (items: NavigationItem[]) => items.filter((item) => can(item.cap) && (!item.adminOnly || user.role === "Admin"));
  const navigationItem = (item: NavigationItem) => {
    const count =
      item.screen === "Signals"
        ? (process.env.NODE_ENV !== "production" && pathname === "/signals" && searchParams.get("mock") === "1" ? 0 : signalsData?.brands.filter(brand => brand.needsReview).length || 0)
        : item.screen === "Brands"
          ? brandReplyCount
          : item.badge
            ? taskCount
            : 0;
    const activeStyle =
      item.screen === "Signals"
        ? "data-[active=true]:bg-white/10 data-[active=true]:text-white"
        : item.screen === "Brands"
          ? "data-[active=true]:bg-blue-500"
          : item.screen === "ReplyTask"
            ? "data-[active=true]:bg-blue-500"
            : item.screen === "Performance"
              ? "data-[active=true]:bg-blue-500/15"
              : item.screen === "Dashboard"
                ? "data-[active=true]:bg-emerald-500"
                : "data-[active=true]:bg-amber-500";
    const label = item.screen === "ReplyTask" && user.role !== "AccountManager" ? "Caller Task" : item.label;
    return (
      <SidebarMenuItem key={item.path}>
        <SidebarMenuButton
          asChild
          tooltip={label}
          isActive={screen === item.screen}
          className={`h-10 rounded-lg px-3 text-[13px] font-medium ${activeStyle} data-[active=true]:text-white`}
        >
          <a
            href={item.path}
            aria-label={label}
            onClick={(event) => {
              if (isModifiedClick(event)) return;
              event.preventDefault();
              portalNavigate(item.path);
            }}
          >
            <item.icon />
            <span>{label}</span>
            {count > 0 && (
              <span className={`ml-auto rounded-md px-1.5 py-0.5 text-[10px] group-data-[collapsible=icon]:hidden ${item.screen === "Brands" ? "bg-rose-500/15 text-rose-800" : "bg-amber-400/20 text-amber-800"}`}>
                {count}
              </span>
            )}
          </a>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  return (
    <SidebarProvider open={sidebarOpen} onOpenChange={setSidebarOpen}>
      <Sidebar collapsible="icon" className="border-r-0">
        <SidebarHeader className="border-b border-slate-300/45 px-3 py-4 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-0">
          <button
            onClick={() => {
              if (isBrandDetailPath) {
                setSidebarOpen(true);
                return;
              }
              portalNavigate(roleHome[state.currentRole]);
            }}
            className="flex items-center gap-3 px-1 text-left"
          >
            <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-[6px] bg-white/35 shadow-[0_8px_24px_rgb(55_125_225/22%)]">
              <img src="/brand-icon.png" alt="Super FollowUP" className="size-8 object-contain" />
            </span>
            <span className="min-w-0 group-data-[collapsible=icon]:hidden">
              <span className="block truncate text-sm font-bold text-slate-900">Super FollowUP</span>
            </span>
          </button>
        </SidebarHeader>
        <SidebarContent className="px-2 py-3">
          {visibleItems(performanceNav).length > 0 && <SidebarGroup className="pt-1">
            <SidebarGroupLabel className="text-[10px] tracking-[.16em] text-slate-500">Performance</SidebarGroupLabel>
            <SidebarGroupContent><SidebarMenu>{visibleItems(performanceNav).map(navigationItem)}</SidebarMenu></SidebarGroupContent>
          </SidebarGroup>}
          {visibleItems(followUpNav).length > 0 && <SidebarGroup>
            <SidebarGroupLabel className="text-[10px] tracking-[.16em] text-slate-500">Follow-up</SidebarGroupLabel>
            <SidebarGroupContent><SidebarMenu>{visibleItems(followUpNav).map(navigationItem)}</SidebarMenu></SidebarGroupContent>
          </SidebarGroup>}
          {visibleItems(resourceNav).length > 0 && <SidebarGroup>
            <SidebarGroupLabel className="text-[10px] tracking-[.16em] text-slate-500">Resources</SidebarGroupLabel>
            <SidebarGroupContent><SidebarMenu>{visibleItems(resourceNav).map(navigationItem)}</SidebarMenu></SidebarGroupContent>
          </SidebarGroup>}
        </SidebarContent>
        <SidebarFooter className="border-t border-slate-300/45 p-3 group-data-[collapsible=icon]:p-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="mt-2 flex w-full items-center gap-3 rounded-xl bg-white/35 p-2 text-left shadow-[inset_0_1px_0_rgb(255_255_255/70%)]">
                <Avatar className="size-8">
                  <AvatarFallback className="bg-violet-200 text-xs font-bold text-violet-800">
                    {accountInitials(user.name, user.email)}
                  </AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
                  <span className="block truncate text-xs font-semibold text-slate-900">{displayName}</span>
                  <span className="block truncate text-[10px] text-slate-600">{user.role}</span>
                </span>
                <ChevronDown className="size-3 text-slate-600 group-data-[collapsible=icon]:hidden" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="end" className="w-64">
              <DropdownMenuLabel className="space-y-0.5 font-normal">
                <span className="block truncate text-sm font-semibold">{displayName}</span>
                <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {isAdmin ? (
                <DropdownMenuItem
                  disabled={clearingCache}
                  onClick={() => {
                    void (async () => {
                      if (clearingCache) return;
                      setClearingCache(true);
                      try {
                        const response = await fetch("/api/admin/cache/clear", { method: "POST" });
                        const payload = await response.json() as { error?: string };
                        if (!response.ok) throw new Error(payload.error || "Unable to clear caches");
                        clearBrandListPageCache();
                        window.dispatchEvent(new Event("fc-portal-caches-cleared"));
                        toast.success("Portal caches cleared");
                      } catch (error) {
                        toast.error(error instanceof Error ? error.message : "Unable to clear caches");
                      } finally {
                        setClearingCache(false);
                      }
                    })();
                  }}
                >
                  <RefreshCw className={`size-4 ${clearingCache ? "animate-spin" : ""}`} />
                  {clearingCache ? "Clearing caches…" : "Clear caches"}
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem
                onClick={async () => {
                  await signOut();
                  portalExit("/login");
                }}
              >
                <LogOut className="size-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset data-signals-workspace={screen === "Signals" ? "" : undefined} className={screen === "Signals" ? "min-w-0 bg-background" : "min-w-0 bg-[#f7f8fc]"}>
        <main className="min-h-svh p-4 sm:p-6 lg:p-8">{children ?? <WorkspaceRouteContent />}</main>
      </SidebarInset>
      <Toaster richColors position="bottom-right" />
    </SidebarProvider>
  );
}

export function WorkspaceRouteContent() {
  const path = usePathname();
  const searchParams = useSearchParams();
  const parts = path.split("/").filter(Boolean);
  const section = parts[0] || "tasks";
  const brandDetailId = section === "customers" ? parts[1] : undefined;
  const sampleRoute = section === "customers" && parts[2]?.toLowerCase() === "sample";
  const dashboardRoute = section === "dashboard";
  const performanceRoute = section === "performance";
  const omniReachRoute = /^(omnireach|bombs)$/i.test(section);
  const taskRoute =
    section === "tasks" ||
    section === "inbox" ||
    section === "call-tasks" ||
    (!dashboardRoute && !performanceRoute && section !== "customers" && section !== "signals" && !omniReachRoute);
  const bombDetailId = omniReachRoute ? parts[1] : undefined;
  const activeRoot =
    dashboardRoute
      ? "dashboard"
      : section === "customers" && !brandDetailId
      ? "brands"
      : taskRoute
        ? "tasks"
        : omniReachRoute && !bombDetailId
          ? "omnireach"
          : undefined;
  const [mountedRoots, setMountedRoots] = useState<Array<"dashboard" | "brands" | "tasks" | "omnireach">>(
    () => (activeRoot ? [activeRoot] : []),
  );
  const [mountedSampleBrandIds, setMountedSampleBrandIds] = useState<string[]>([]);

  useEffect(() => {
    if (!activeRoot) return;
    setMountedRoots((current) => (current.includes(activeRoot) ? current : [...current, activeRoot]));
  }, [activeRoot]);

  useEffect(() => {
    if (!sampleRoute || !brandDetailId) return;
    setMountedSampleBrandIds((current) => (current.includes(brandDetailId) ? current : [...current, brandDetailId]));
  }, [sampleRoute, brandDetailId]);

  return (
    <>
      {section === "signals" ? <SignalsPage /> : null}
      {performanceRoute ? <PerformancePages /> : null}
      {mountedRoots.includes("dashboard") ? (
        <div hidden={activeRoot !== "dashboard"}>
          <CallerDashboard />
        </div>
      ) : null}
      {mountedRoots.includes("brands") ? (
        <div hidden={activeRoot !== "brands"}>
          <BrandsPage active={activeRoot === "brands"} />
        </div>
      ) : null}
      {brandDetailId ? (
        <div hidden={!!sampleRoute}>
          <BrandDetail key={brandDetailId} customerId={brandDetailId} />
        </div>
      ) : null}
      {brandDetailId && mountedSampleBrandIds.includes(brandDetailId) ? (
        <div hidden={!sampleRoute}>
          <SampleManagementPage key={brandDetailId} customerId={brandDetailId} />
        </div>
      ) : null}

      {mountedRoots.includes("tasks") ? (
        <div hidden={!taskRoute}>
          <TasksPage
            selectedId={taskRoute ? parts[1] : undefined}
            selectedCallId={taskRoute ? searchParams.get("callId") || undefined : undefined}
            returnToDashboard={taskRoute && searchParams.get("from") === "dashboard"}
          />
        </div>
      ) : null}

      {mountedRoots.includes("omnireach") ? (
        <div hidden={activeRoot !== "omnireach"}>
          <BombsPage active={activeRoot === "omnireach"} />
        </div>
      ) : null}
      {bombDetailId ? <BombEditor bombId={bombDetailId} /> : null}
    </>
  );
}

function CallerDashboard() {
  return <QualifiedCallsDashboard />;
}
