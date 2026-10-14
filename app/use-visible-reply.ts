"use client";

import { useEffect, useState, type RefObject } from "react";

/** Keep the mobile toolbar attached to the visible message, including nested scroll areas. */
export function useVisibleReply(container: RefObject<HTMLDivElement | null>, messageKey: string) {
  const [visibleReply, setVisibleReply] = useState<string | null>(null);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const mobile = window.matchMedia("(max-width: 639px)");
    let frame = 0;
    const update = () => {
      frame = 0;
      if (!mobile.matches) { setVisibleReply(null); return; }
      let top = 0;
      let bottom = window.innerHeight - 100;
      for (let parent: HTMLElement | null = element.parentElement; parent; parent = parent.parentElement) {
        if (!/(auto|scroll|hidden|clip)/.test(getComputedStyle(parent).overflowY)) continue;
        const rect = parent.getBoundingClientRect();
        top = Math.max(top, rect.top);
        bottom = Math.min(bottom, rect.bottom);
      }
      const center = (top + bottom) / 2;
      let selected: string | null = null;
      let closest = Infinity;
      // All thread groups choose the same message, so only one toolbar can appear.
      for (const message of document.querySelectorAll<HTMLElement>("[data-pending-reply]")) {
        const rect = message.getBoundingClientRect();
        if (rect.bottom <= top || rect.top >= bottom) continue;
        const distance = Math.abs((Math.max(top, rect.top) + Math.min(bottom, rect.bottom)) / 2 - center);
        if (distance < closest) {
          closest = distance;
          selected = message.dataset.interactionId || null;
        }
      }
      setVisibleReply(selected);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    const observer = new ResizeObserver(schedule);
    observer.observe(element);
    document.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    mobile.addEventListener("change", schedule);
    schedule();
    return () => {
      observer.disconnect();
      document.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      mobile.removeEventListener("change", schedule);
      cancelAnimationFrame(frame);
    };
  }, [container, messageKey]);

  return visibleReply;
}
