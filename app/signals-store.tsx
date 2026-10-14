"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { mockSignals } from "@/lib/signals/mock";
import type { SignalsPayload, SignalReview } from "@/lib/signals/model";
import { summarize } from "@/lib/signals/model";
import type { SessionUser } from "@/lib/auth-session";
import { useSession } from "./use-session";

/**
 * How often the cheap change token at /api/signals/pulse is polled. The probe
 * only reads a few Supabase timestamps, so it can run far more often than the
 * full payload request (which fans out to Notion).
 */
const PULSE_INTERVAL_MS = 5000;
/** Safety net: force a full refresh even if the probe never reports a change. */
const FULL_REFRESH_INTERVAL_MS = 60000;

const Context = createContext<{
  data: SignalsPayload | null;
  error: string | null;
  refresh: () => Promise<void>;
  settle: (
    brandId: string,
    eventIds: string[],
    status?: SignalReview["status"],
    taskId?: string,
    surface?: "signals" | "brand",
  ) => void;
} | null>(null);
function isMockPreviewPath(pathname: string | null, searchParams: URLSearchParams) {
  return process.env.NODE_ENV !== "production" &&
    searchParams.get("mock") === "1" &&
    (pathname === "/signals" || /^\/customers\/[^/]+(?:\/sample)?$/.test(pathname || ""));
}
export function SignalsProvider({ children }: { children: ReactNode }) {
  const { user, loading } = useSession();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const preview = isMockPreviewPath(pathname, searchParams);
  return (
    <SessionSignalsProvider
      key={`${user?.email || "anonymous"}:${user?.role || ""}:${preview ? "mock" : "live"}`}
      user={user}
      loading={loading}
    >
      {children}
    </SessionSignalsProvider>
  );
}
function SessionSignalsProvider({
  children,
  user,
  loading,
}: {
  children: ReactNode;
  user: SessionUser | null;
  loading: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const mock = isMockPreviewPath(pathname, searchParams);
  const [data, setData] = useState<SignalsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const previous = useRef<SignalsPayload | null>(null);
  const busy = useRef(false);
  /** Last change token the UI has already rendered. */
  const seenVersion = useRef<string | null>(null);
  const stillOnSameMode = useCallback(
    (isMock: boolean) =>
      isMockPreviewPath(
        window.location.pathname,
        new URLSearchParams(window.location.search),
      ) === isMock,
    [],
  );
  /** Swap in a fresh payload, surfacing first-of-its-kind activity to the AM. */
  const applyPayload = useCallback(
    (payload: SignalsPayload) => {
      if (previous.current) {
        const ids = new Set(
          previous.current.brands.flatMap((b) => b.events.map((e) => e.id)),
        );
        const fresh = payload.brands.filter((b) =>
          b.events.some((e) => !ids.has(e.id)),
        );
        for (const brand of fresh) {
          const old = previous.current.brands.find((b) => b.id === brand.id);
          if (
            brand.events.some((e) => e.type === "sample" && !ids.has(e.id)) &&
            !old?.events.some((e) => e.type === "sample")
          )
            toast("First sample tap", {
              description: brand.name,
              action: {
                label: "Review",
                onClick: () =>
                  router.push(`/signals?brand=${encodeURIComponent(brand.id)}`),
              },
            });
        }
        const linkedin = fresh.filter((b) =>
          b.events.some((e) => e.type === "linkedin" && !ids.has(e.id)),
        );
        if (linkedin.length)
          toast("LinkedIn updates", {
            description: `${linkedin.length} brands have relevant changes`,
            action: {
              label: "Review",
              onClick: () =>
                router.push(
                  `/signals?brand=${encodeURIComponent(linkedin[0].id)}`,
                ),
            },
          });
      }
      previous.current = payload;
      setData(payload);
      setError(null);
    },
    [router],
  );
  const refresh = useCallback(async () => {
    if (mock) {
      const payload = mockSignals();
      previous.current = payload;
      setData(payload);
      setError(null);
      return;
    }
    if (busy.current || loading || !user || user.role === "Caller") return;
    busy.current = true;
    try {
      const response = await fetch("/api/signals", { cache: "no-store" });
      const payload = (await response.json()) as SignalsPayload & {
        error?: string;
      };
      // Ignore a live response that began before the user switched to mock data.
      if (!stillOnSameMode(mock)) return;
      if (!response.ok) throw new Error("Unable to load signals");
      applyPayload(payload);
    } catch {
      if (!stillOnSameMode(mock)) return;
      setError("Unable to load signals");
    } finally {
      busy.current = false;
    }
  }, [applyPayload, loading, mock, stillOnSameMode, user]);
  useEffect(() => {
    if (loading || !user || user.role === "Caller") return;
    // Initial load, deferred so state lands in a callback rather than inline.
    // refresh() owns the mock branch, so preview paths stop here.
    const initial = window.setTimeout(() => void refresh(), 0);
    if (mock) return () => window.clearTimeout(initial);
    let stopped = false;
    // Poll the cheap token first; only pull the full payload when it moves, so
    // a new tap lands without the user reloading and without hammering Notion.
    const probe = async () => {
      if (stopped || busy.current) return;
      try {
        const response = await fetch("/api/signals/pulse", { cache: "no-store" });
        if (!response.ok) return;
        const { version } = (await response.json()) as { version?: string };
        if (stopped || !version) return;
        // First observation only records the token: the initial refresh below
        // already rendered exactly this state.
        if (seenVersion.current === null) {
          seenVersion.current = version;
          return;
        }
        if (version === seenVersion.current) return;
        seenVersion.current = version;
        await refresh();
      } catch {
        // Transient probe failure: the next tick retries.
      }
    };
    const pulse = window.setInterval(() => {
      if (document.visibilityState === "visible") void probe();
    }, PULSE_INTERVAL_MS);
    const safety = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, FULL_REFRESH_INTERVAL_MS);
    const onFocus = () => void probe();
    window.addEventListener("focus", onFocus);
    return () => {
      stopped = true;
      window.clearTimeout(initial);
      window.clearInterval(pulse);
      window.clearInterval(safety);
      window.removeEventListener("focus", onFocus);
    };
  }, [loading, mock, refresh, user]);
  const settle = useCallback(
    (
      brandId: string,
      eventIds: string[],
      status?: SignalReview["status"],
      taskId?: string,
      surface: "signals" | "brand" = "signals",
    ) => {
      setData((current) => {
        if (!current) return current;
        const brands = current.brands.map((brand) => {
          if (brand.id !== brandId) return brand;
          const requested = new Set(eventIds);
          const related = brand.events.filter((event) =>
            requested.has(event.id) || requested.has(event.signalReadId || ""),
          );
          const sampleReadIds = related
            .filter((event) => event.type === "sample")
            .map((event) => event.signalReadId || event.id);
          const sharedReadIds = related
            .filter((event) => event.type !== "sample")
            .map((event) => event.signalReadId || event.id);
          const readIds = [...new Set([
            ...(brand.readEventIds || []),
            ...(surface === "signals" ? eventIds : sharedReadIds),
          ])];
          const brandReadEventIds = [...new Set([
            ...(brand.brandReadEventIds || []),
            ...(surface === "brand" ? sampleReadIds : []),
          ])];
          const fresh =
            brand.newEventIds?.length
              ? brand.newEventIds
              : brand.events.filter((event) => event.isNewSignal).map((event) => event.id);
          // The red dot and the nav badge follow unread only. `needsReview` must
          // be recomputed here too — leaving it stale kept the sidebar count lit
          // after the list had already settled.
          const unread = fresh.some((id) => !readIds.includes(id));
          const next: typeof brand = {
            ...brand,
            readEventIds: readIds,
            brandReadEventIds,
            unread,
            needsReview: unread,
          };
          if (!status) return next;
          return {
            ...next,
            reviewedEventIds: [
              ...new Set([...(brand.reviewedEventIds || []), ...eventIds]),
            ],
            status: unread ? ("Needs Review" as const) : status,
            needsReview: unread,
            taskId,
          };
        });
        return { ...current, brands, summary: summarize(brands) };
      });
    },
    [],
  );
  return (
    <Context.Provider value={{ data, error, refresh, settle }}>
      {children}
    </Context.Provider>
  );
}
export function useSignals() {
  const value = useContext(Context);
  if (!value) throw new Error("SignalsProvider required");
  return value;
}
