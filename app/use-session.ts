"use client";

import { useCallback, useEffect, useState } from "react";
import type { SessionUser } from "@/lib/auth-session";

/** Survives client remounts during soft navigations so the sidebar doesn't flash. */
let cachedUser: SessionUser | null | undefined;
let inflight: Promise<SessionUser | null> | null = null;

async function fetchSessionUser() {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const response = await fetch("/api/auth/me");
      const payload = (await response.json()) as { user?: SessionUser | null };
      cachedUser = payload.user ?? null;
      return cachedUser;
    } catch {
      cachedUser = null;
      return null;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function useSession() {
  const [user, setUser] = useState<SessionUser | null>(() => cachedUser ?? null);
  const [loading, setLoading] = useState(() => cachedUser === undefined);

  const refresh = useCallback(async () => {
    const next = await fetchSessionUser();
    setUser((prev) => {
      if (
        prev?.email === next?.email &&
        prev?.role === next?.role &&
        prev?.name === next?.name
      ) {
        return prev;
      }
      return next;
    });
    setLoading(false);
    return next;
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signOut = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    cachedUser = null;
    setUser(null);
  }, []);

  return { user, loading, refresh, signOut };
}
