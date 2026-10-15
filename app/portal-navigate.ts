/**
 * Soft-navigate inside the client-only portal shell without vinext/Next RSC
 * transitions. The portal layout keeps the sidebar mounted and switches views
 * from `usePathname()`; a full app-router navigation is unnecessary and has
 * crashed in production (`TypeError: e is not a function` inside startTransition).
 *
 * Vinext patches `history.pushState` / `replaceState` to call
 * `commitClientNavigationState()`, which updates `usePathname` subscribers.
 */
export function portalNavigate(path: string, mode: "push" | "replace" = "push") {
  if (typeof window === "undefined") return;
  const url = new URL(path, window.location.href);
  const next = `${url.pathname}${url.search}${url.hash}`;
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (next === current) return;
  if (mode === "replace") {
    window.history.replaceState(window.history.state, "", next);
  } else {
    window.history.pushState(window.history.state, "", next);
  }
}

/** Leave the portal shell (login / hard reload). */
export function portalExit(path: string) {
  if (typeof window === "undefined") return;
  window.location.assign(path);
}
