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
  img: new Set(["src", "alt", "width"]),
};

export const MAX_IMAGE_WIDTH = 1200;

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

const ENTITY_RE = /&(?:#x([0-9a-f]+)|#(\d+)|([a-z][a-z0-9]{1,31}));/gi;

const BASIC_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00a0",
};

const NAMED_ENTITIES: Record<string, string> = {
  ...BASIC_ENTITIES,
  ensp: "\u2002",
  emsp: "\u2003",
  thinsp: "\u2009",
  ndash: "\u2013",
  mdash: "\u2014",
  lsquo: "\u2018",
  rsquo: "\u2019",
  sbquo: "\u201a",
  ldquo: "\u201c",
  rdquo: "\u201d",
  bdquo: "\u201e",
  laquo: "\u00ab",
  raquo: "\u00bb",
  hellip: "\u2026",
  bull: "\u2022",
  middot: "\u00b7",
  copy: "\u00a9",
  reg: "\u00ae",
  trade: "\u2122",
  deg: "\u00b0",
  plusmn: "\u00b1",
  times: "\u00d7",
  divide: "\u00f7",
  euro: "\u20ac",
  pound: "\u00a3",
  yen: "\u00a5",
  cent: "\u00a2",
  sect: "\u00a7",
  para: "\u00b6",
  iexcl: "\u00a1",
  iquest: "\u00bf",
  rarr: "\u2192",
  larr: "\u2190",
  check: "\u2713",
  agrave: "\u00e0",
  aacute: "\u00e1",
  acirc: "\u00e2",
  auml: "\u00e4",
  ccedil: "\u00e7",
  egrave: "\u00e8",
  eacute: "\u00e9",
  ecirc: "\u00ea",
  euml: "\u00eb",
  iacute: "\u00ed",
  iuml: "\u00ef",
  ntilde: "\u00f1",
  oacute: "\u00f3",
  ocirc: "\u00f4",
  ouml: "\u00f6",
  uacute: "\u00fa",
  uuml: "\u00fc",
  szlig: "\u00df",
  Agrave: "\u00c0",
  Aacute: "\u00c1",
  Auml: "\u00c4",
  Ccedil: "\u00c7",
  Eacute: "\u00c9",
  Egrave: "\u00c8",
  Ntilde: "\u00d1",
  Ouml: "\u00d6",
  Uuml: "\u00dc",
};

function decodeEntity(entity: string, hex?: string, dec?: string, name?: string) {
  if (name) return NAMED_ENTITIES[name] ?? BASIC_ENTITIES[name.toLowerCase()] ?? entity;
  const code = hex ? parseInt(hex, 16) : Number(dec);
  return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
}

/**
 * Re-encodes raw HTML text. Entities we can't decode stay as written so the mail client renders them
 * the same way the browser did, instead of showing a literal "&mdash;".
 * Runs of spaces collapse in HTML, so keep the editor's spacing the way Gmail does: "a&nbsp; b".
 */
function escapeTextNode(raw: string) {
  let out = "";
  let last = 0;
  for (const match of raw.matchAll(ENTITY_RE)) {
    const [entity, hex, dec, name] = match;
    const decoded = decodeEntity(entity, hex, dec, name);
    out += escapeHtmlText(raw.slice(last, match.index)) + (decoded === entity ? entity : escapeHtmlText(decoded));
    last = match.index + entity.length;
  }
  out += escapeHtmlText(raw.slice(last));
  return out.replace(/ {2,}/g, (run) => "&nbsp;".repeat(run.length - 1) + " ").replace(/\u00a0/g, "&nbsp;");
}

function decodeEntities(value: string) {
  return value.replace(ENTITY_RE, (entity, hex, dec, name) => decodeEntity(entity, hex, dec, name));
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
    const width = Number.parseInt(attrs.width || "", 10);
    if (Number.isFinite(width) && width > 0) {
      const px = Math.min(width, MAX_IMAGE_WIDTH);
      kept.push(`width="${px}"`);
      kept.push(`style="width:${px}px;max-width:100%;height:auto"`);
    } else {
      kept.push('style="max-width:100%;height:auto"');
    }
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
      if (!dropping) out += escapeTextNode(text);
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

/**
 * Rewrite editor paragraphs into Gmail's own line structure: one `<div>` per line and
 * `<div><br></div>` for a blank line. Mail clients give an empty `<p></p>` zero height
 * (so blank lines vanish) and `<p>` margins vary per client, while divs render the same
 * everywhere. A line ending in `<br>` gets a second one because the editor shows that
 * trailing break as its own line but browsers swallow a single trailing `<br>`.
 */
export function toGmailBlockHtml(html: string) {
  return (html || "").replace(/<p(\s[^>]*)?>([\s\S]*?)<\/p>/gi, (_match, attrs: string | undefined, inner: string) => {
    const bare = inner.trim();
    let body = inner;
    if (!bare) body = "<br />";
    else if (/<br\s*\/?>$/i.test(bare)) body = `${bare}<br />`;
    return `<div${attrs || ""}>${body}</div>`;
  });
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
  return { kind: "html", content: toGmailBlockHtml(html) };
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
