export type TemplateVariableCategory = "Company" | "Contact" | "Sender";

export type TemplateVariable = {
  key: string;
  label: string;
  category: TemplateVariableCategory;
  description: string;
};

export const SENDER_NAME_TOKEN = "[Sender Name]";

export const templateVariables: TemplateVariable[] = [
  { key: "company_name", label: "Company name", category: "Company", description: "ClientDB → Company Name" },
  { key: "product_description", label: "Product description", category: "Company", description: "ClientDB → Product Description" },
  { key: "Matched Category", label: "Matched category", category: "Company", description: "ClientDB → Matched Category" },
  { key: "Follow-up-Exhibition", label: "Follow-up Exhibition", category: "Company", description: "Follow-up ClientDB → Follow-up Exhibition" },
  { key: "contact_name", label: "Contact name", category: "Contact", description: "KeyPersonDB → name" },
  { key: "contact_title", label: "Title", category: "Contact", description: "KeyPersonDB → Title" },
  { key: "contact_role", label: "Contact role", category: "Contact", description: "KeyPersonDB → Contact Role" },
  { key: "email", label: "Email", category: "Contact", description: "KeyPersonDB → Email" },
  { key: "phone", label: "Phone", category: "Contact", description: "KeyPersonDB → Phone" },
  { key: "owner_name", label: "Owner name", category: "Contact", description: "KeyPersonDB → name of the Owner on this brand" },
  { key: "owner_or_connector", label: "Owner or Connector", category: "Contact", description: "KeyPersonDB → OwnerOrConnector" },
  { key: "LinkedIn URL", label: "LinkedIn URL", category: "Contact", description: "KeyPersonDB → LinkedIn URL" },
  { key: "Sender Name", label: "Sender name", category: "Sender", description: ".env → SENDER_NAME" },
];

export type TemplateVariableSource = {
  companyName?: string | null;
  productDescription?: string | null;
  matchedCategory?: string | null;
  followupExhibition?: string | null;
  contactName?: string | null;
  contactTitle?: string | null;
  contactRole?: string | null;
  email?: string | null;
  phone?: string | null;
  ownerName?: string | null;
  ownerOrConnector?: string | null;
  linkedinUrl?: string | null;
  senderName?: string | null;
  hasContact?: boolean;
};

export function ownerNameFromContacts(
  contacts?: Array<{ role?: string | null; name?: string | null }> | null,
) {
  const owner = contacts?.find((item) => item.role === "Owner" && item.name?.trim());
  return owner?.name?.trim() || null;
}

export type TemplateVariableContext = Record<string, string>;

export type OutboundTemplateFields = {
  channel: string;
  subject?: string | null;
  content?: string | null;
  callGoal?: string | null;
  script?: string | null;
};

export type ResolvedOutboundFields = {
  subject: string;
  content: string;
};

declare global {
  interface ImportMetaEnv {
    readonly SENDER_NAME?: string;
  }
}

/** Outbound sender display name from `.env` (`SENDER_NAME`). */
export function getSenderName() {
  const fromImportMeta =
    typeof import.meta !== "undefined"
      ? (import.meta.env?.SENDER_NAME as string | undefined)
      : undefined;
  const fromProcess =
    typeof process !== "undefined" ? process.env.SENDER_NAME : undefined;
  return (fromImportMeta || fromProcess || "").trim();
}

export function variableToken(key: string) {
  if (normalizeVariableKey(key) === "sender_name") return SENDER_NAME_TOKEN;
  return `{{${key}}}`;
}

function normalizeVariableKey(key: string) {
  return key.trim().replace(/[\s-]+/g, "_").toLowerCase();
}

function contextValue(context: TemplateVariableContext, key: string) {
  if (Object.prototype.hasOwnProperty.call(context, key)) return context[key];
  const normalized = normalizeVariableKey(key);
  for (const [candidate, value] of Object.entries(context)) {
    if (normalizeVariableKey(candidate) === normalized) return value;
  }
  return undefined;
}

export function buildTemplateVariableContext(source: TemplateVariableSource): TemplateVariableContext {
  const senderName = (source.senderName ?? getSenderName()).trim();
  const ownerName =
    source.ownerName?.trim() ||
    (source.ownerOrConnector?.trim() === "Owner" ? source.contactName?.trim() || "" : "");
  const context: TemplateVariableContext = {
    company_name: source.companyName?.trim() || "",
    product_description: source.productDescription?.trim() || "",
    "Matched Category": source.matchedCategory?.trim() || "",
    "Follow-up-Exhibition": source.followupExhibition?.trim() || "",
    "Sender Name": senderName,
    sender_name: senderName,
  };
  if (ownerName) context.owner_name = ownerName;
  const hasContact = source.hasContact === true || [
    source.contactName,
    source.contactTitle,
    source.contactRole,
    source.email,
    source.phone,
    source.ownerOrConnector,
    source.linkedinUrl,
  ].some((value) => value != null && String(value).trim() !== "");
  if (!hasContact) return context;
  return {
    ...context,
    contact_name: source.contactName?.trim() || "",
    first_name: source.contactName?.trim().split(/\s+/)[0] || "",
    contact_title: source.contactTitle?.trim() || "",
    contact_role: source.contactRole?.trim() || "",
    email: source.email?.trim() || "",
    phone: source.phone?.trim() || "",
    owner_or_connector: source.ownerOrConnector?.trim() || "",
    "LinkedIn URL": source.linkedinUrl?.trim() || "",
  };
}

export function resolveTemplateVariables(
  text: string | undefined,
  context: TemplateVariableContext,
) {
  if (!text) return "";
  const withMustache = text.replace(/{{\s*([^}]+?)\s*}}/g, (placeholder, rawKey: string) => {
    const value = contextValue(context, rawKey.trim());
    return value === undefined ? placeholder : value;
  });
  // Copy templates use the literal `[Sender Name]` (not mustache).
  const senderValue = contextValue(context, "Sender Name");
  if (senderValue === undefined) return withMustache;
  return withMustache.replace(/\[\s*Sender\s+Name\s*\]/gi, senderValue);
}

export function resolveOutboundFields(
  input: OutboundTemplateFields,
  context: TemplateVariableContext,
): ResolvedOutboundFields {
  const resolve = (value?: string | null) => resolveTemplateVariables(value || "", context);
  if (input.channel === "Phone") {
    return {
      subject: "",
      content: resolve(input.script) || resolve(input.callGoal),
    };
  }
  if (input.channel === "Email") {
    return {
      subject: resolve(input.subject),
      content: resolve(input.content),
    };
  }
  return {
    subject: "",
    content: resolve(input.content),
  };
}

export function resolveLaunchStepCopy(
  copy: { subject?: string; content?: string; callGoal?: string; script?: string },
  context: TemplateVariableContext,
) {
  const resolve = (value?: string) => resolveTemplateVariables(value || "", context);
  return {
    subject: resolve(copy.subject),
    content: resolve(copy.content),
    callGoal: resolve(copy.callGoal),
    script: resolve(copy.script),
  };
}
