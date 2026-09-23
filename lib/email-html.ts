/** Email HTML allowlist sanitizer. No DOM / jsdom — safe on Cloudflare Workers. */

const ALLOWED_TAGS = new Set([
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "a",
  "ul",
  "ol",
  "li",
  "img",
  "h1",
  "h2",
  "h3",
  "blockquote",
  "div",
  "span",
]);

const VOID_TAGS = new Set(["br", "img"]);

const DROP_WITH_CONTENT = new Set([
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "link",
  "meta",
  "base",
  "form",
  "textarea",
  "svg",
  "math",
  "noscript",
]);

const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(["href"]),
  img: new Set(["src", "alt"]),
};

const HTML_TAG_RE = /<(p|div|br\s*\/?|img|strong|em|b|i|u|ul|ol|li|a|h[1-3]|blockquote)\b/i;
const BASE64_MEDIA_RE = /data:(image|video|application)\/[a-z0-9.+-]+;base64,/i;
const TAG_NAME_RE = /^[a-z][a-z0-9:-]*$/i;

export type EmailContentKind = "empty" | "plain" | "html";

export type PreparedEmailContent = {
  kind: EmailContentKind;
  content: string;
};

export function looksLikeEmailHtml(value: string) {
  return HTML_TAG_RE.test(value || "");
}

export function containsInlineBase64(value: string) {
  return BASE64_MEDIA_RE.test(value || "");
}

export function escapeHtmlText(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function decodeEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&amp;/gi, "&");
}

function skipUntil(html: string, start: number, needle: string) {
  const at = html.toLowerCase().indexOf(needle, start);
  return at < 0 ? html.length : at + needle.length;
}

function isSafeHref(raw: string) {
  const url = raw.trim();
  const lower = url.toLowerCase();
  if (!url) return false;
  if (lower.startsWith("javascript:") || lower.startsWith("data:") || lower.startsWith("vbscript:")) {
    return false;
  }
  return lower.startsWith("https://") || lower.startsWith("mailto:");
}

/** Display-time check: https images only, never svg / data. */
export function isSafeDisplayImageUrl(url: string) {
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== "https:") return false;
    if (parsed.pathname.toLowerCase().endsWith(".svg")) return false;
    if ((parsed.hostname || "").toLowerCase() === "data") return false;
    return parsed.pathname.length > 1 || parsed.search.length > 0;
  } catch {
    return false;
  }
}

type AttrMap = Record<string, string>;

function parseTag(html: string, start: number): {
  end: number;
  name: string;
  closing: boolean;
  selfClosing: boolean;
  attrs: AttrMap;
} | null {
  if (html[start] !== "<") return null;
  let i = start + 1;
  const closing = html[i] === "/";
  if (closing) i += 1;
  const nameStart = i;
  while (i < html.length && /[a-z0-9:-]/i.test(html[i])) i += 1;
  const name = html.slice(nameStart, i).toLowerCase();
  if (!name || !TAG_NAME_RE.test(name)) return null;
  const attrs: AttrMap = {};
  while (i < html.length) {
    while (i < html.length && /[\s\n\r\t]/.test(html[i])) i += 1;
    if (i >= html.length) break;
    if (html[i] === ">") {
      i += 1;
      return { end: i, name, closing, selfClosing: false, attrs };
    }
    if (html[i] === "/" && html[i + 1] === ">") {
      return { end: i + 2, name, closing, selfClosing: true, attrs };
    }
    const attrStart = i;
    while (i < html.length && /[a-z0-9:_-]/i.test(html[i])) i += 1;
    if (i === attrStart) {
      i += 1;
      continue;
    }
    const attrName = html.slice(attrStart, i).toLowerCase();
    while (i < html.length && /[\s\n\r\t]/.test(html[i])) i += 1;
    let attrValue = "";
    if (html[i] === "=") {
      i += 1;
      while (i < html.length && /[\s\n\r\t]/.test(html[i])) i += 1;
      const quote = html[i];
      if (quote === '"' || quote === "'") {
        i += 1;
        const valueStart = i;
        while (i < html.length && html[i] !== quote) i += 1;
        attrValue = html.slice(valueStart, i);
        if (html[i] === quote) i += 1;
      } else {
        const valueStart = i;
        while (i < html.length && !/[\s>]/.test(html[i])) i += 1;
        attrValue = html.slice(valueStart, i);
      }
    }
    attrs[attrName] = decodeEntities(attrValue);
  }
  return { end: html.length, name, closing, selfClosing: false, attrs };
}

function renderOpenTag(name: string, attrs: AttrMap, allowImageUrl: (url: string) => boolean): string | null {
  if (!ALLOWED_TAGS.has(name)) return "";
  const allowed = ALLOWED_ATTRS[name];
  const kept: string[] = [];
  if (name === "img") {
    const src = (attrs.src || "").trim();
    if (!src || !allowImageUrl(src)) return null;
    kept.push(`src="${escapeHtmlText(src)}"`);
    const alt = (attrs.alt || "").trim();
    if (alt) kept.push(`alt="${escapeHtmlText(alt)}"`);
    kept.push('style="max-width:100%;height:auto"');
  } else if (name === "a") {
    const href = (attrs.href || "").trim();
    if (href && isSafeHref(href)) {
      kept.push(`href="${escapeHtmlText(href)}"`);
      kept.push('rel="noopener noreferrer"');
    }
  } else if (allowed) {
    for (const [key, value] of Object.entries(attrs)) {
      if (!allowed.has(key) || !value) continue;
      kept.push(`${key}="${escapeHtmlText(value)}"`);
    }
  }
  const attrText = kept.length ? ` ${kept.join(" ")}` : "";
  if (VOID_TAGS.has(name)) return `<${name}${attrText} />`;
  return `<${name}${attrText}>`;
}

export function sanitizeEmailHtml(html: string, allowImageUrl: (url: string) => boolean) {
  const source = html || "";
  let out = "";
  let i = 0;
  let dropping = "";
  let dropDepth = 0;
  while (i < source.length) {
    const ch = source[i];
    if (ch !== "<") {
      const next = source.indexOf("<", i);
      const text = source.slice(i, next < 0 ? source.length : next);
      if (!dropping) out += escapeHtmlText(text);
      i = next < 0 ? source.length : next;
      continue;
    }
    if (source.startsWith("<!--", i)) {
      i = skipUntil(source, i + 4, "-->");
      continue;
    }
    const rest = source.slice(i, i + 9).toLowerCase();
    if (rest.startsWith("<![cdata[")) {
      i = skipUntil(source, i, "]]>");
      continue;
    }
    if (source.startsWith("<!", i) || source.startsWith("<?", i)) {
      i = skipUntil(source, i, ">");
      continue;
    }
    const tag = parseTag(source, i);
    if (!tag) {
      if (!dropping) out += "&lt;";
      i += 1;
      continue;
    }
    i = tag.end;
    if (dropping) {
      if (tag.name === dropping && !tag.closing && !tag.selfClosing) dropDepth += 1;
      else if (tag.name === dropping && tag.closing) {
        dropDepth -= 1;
        if (dropDepth <= 0) {
          dropping = "";
          dropDepth = 0;
        }
      }
      continue;
    }
    if (DROP_WITH_CONTENT.has(tag.name)) {
      if (!tag.closing && !tag.selfClosing) {
        dropping = tag.name;
        dropDepth = 1;
      }
      continue;
    }
    if (tag.closing) {
      if (ALLOWED_TAGS.has(tag.name) && !VOID_TAGS.has(tag.name)) out += `</${tag.name}>`;
      continue;
    }
    const rendered = renderOpenTag(tag.name, tag.attrs, allowImageUrl);
    if (rendered) out += rendered;
  }
  return out.trim();
}

export function htmlToPlainText(html: string) {
  const withBreaks = (html || "")
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\s*\/\s*(p|div|li|h1|h2|h3|blockquote)\s*>/gi, "\n")
    .replace(/<\s*img\b[^>]*>/gi, "")
    .replace(/<[^>]+>/g, "");
  return decodeEntities(withBreaks)
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function emailBodyIsEmpty(value: string) {
  const text = looksLikeEmailHtml(value) ? htmlToPlainText(value) : (value || "").trim();
  if (text) return false;
  return !/<img\b/i.test(value || "");
}

export function prepareEmailContent(
  value: string,
  allowImageUrl: (url: string) => boolean,
): PreparedEmailContent {
  const raw = value || "";
  if (containsInlineBase64(raw)) {
    throw new Error("Inline base64 media is not allowed. Upload images to S3 and insert tags.");
  }
  if (!raw.trim()) return { kind: "empty", content: "" };
  if (!looksLikeEmailHtml(raw)) return { kind: "plain", content: raw };
  const html = sanitizeEmailHtml(raw, allowImageUrl);
  if (!html || emailBodyIsEmpty(html)) return { kind: "empty", content: "" };
  return { kind: "html", content: html };
}

export function extractEmailImageSrcs(html: string) {
  const srcs: string[] = [];
  const re = /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  let match: RegExpExecArray | null = re.exec(html);
  while (match) {
    if (match[1]) srcs.push(match[1]);
    match = re.exec(html);
  }
  return srcs;
}
