"use client";

import { useEffect } from "react";
import { APP_NAME, documentTitle, type PageMeta } from "@/lib/page-metadata";

function upsertMeta(
  selector: string,
  attrs: Record<string, string>,
  content: string,
) {
  let el = document.querySelector(selector);
  if (!el) {
    el = document.createElement("meta");
    Object.entries(attrs).forEach(([key, value]) =>
      el!.setAttribute(key, value),
    );
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

export function usePageMetadata(page: PageMeta) {
  useEffect(() => {
    const title = documentTitle(page.title);
    document.title = title;
    upsertMeta('meta[name="description"]', { name: "description" }, page.description);
    upsertMeta('meta[property="og:title"]', { property: "og:title" }, title);
    upsertMeta(
      'meta[property="og:description"]',
      { property: "og:description" },
      page.description,
    );
    upsertMeta('meta[property="og:site_name"]', { property: "og:site_name" }, APP_NAME);
  }, [page.title, page.description]);
}
