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
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { SignalsPayload, SignalReview } from "@/lib/signals/model";
import type { SessionUser } from "@/lib/auth-session";
import { useSession } from "./use-session";
const Context = createContext<{
  data: SignalsPayload | null;
  error: string | null;
  refresh: () => Promise<void>;
  settle: (
    brandId: string,
    eventIds: string[],
    status?: SignalReview["status"],
    taskId?: string,
  ) => void;
} | null>(null);
export function SignalsProvider({ children }: { children: ReactNode }) {
  const { user, loading } = useSession();
  return (
    <SessionSignalsProvider
      key={`${user?.email || "anonymous"}:${user?.role || ""}`}
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
  const [data, setData] = useState<SignalsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const previous = useRef<SignalsPayload | null>(null);
  const busy = useRef(false);
  const refresh = useCallback(async () => {
    if (busy.current || loading || !user || user.role === "Caller") return;
    busy.current = true;
    try {
      const response = await fetch("/api/signals", { cache: "no-store" });
      const payload = (await response.json()) as SignalsPayload & {
        error?: string;
      };
      if (!response.ok)
        throw new Error(payload.error || "Unable to load signals");
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
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Unable to load signals",
      );
    } finally {
      busy.current = false;
    }
  }, [loading, user, router]);
  useEffect(() => {
    const initial = setTimeout(() => void refresh(), 0);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 15000);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);
  const settle = useCallback(
    (
      brandId: string,
      eventIds: string[],
      status?: SignalReview["status"],
      taskId?: string,
    ) => {
      const ids = new Set(eventIds);
      setData((current) =>
        current
          ? {
              ...current,
              brands: current.brands.map((brand) =>
                brand.id !== brandId
                  ? brand
                  : {
                      ...brand,
                      unread: brand.events.some((event) => !ids.has(event.id)),
                      ...(status
                        ? {
                            status: brand.events.some(
                              (event) => !ids.has(event.id),
                            )
                              ? ("Needs Review" as const)
                              : status,
                            needsReview: brand.events.some(
                              (event) => !ids.has(event.id),
                            ),
                            taskId,
                          }
                        : {}),
                    },
              ),
            }
          : current,
      );
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
