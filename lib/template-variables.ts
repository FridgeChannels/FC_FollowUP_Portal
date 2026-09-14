export type TemplateVariableCategory = "Company" | "Contact";

export type TemplateVariable = {
  key: string;
  label: string;
  category: TemplateVariableCategory;
  description: string;
};

export const templateVariables: TemplateVariable[] = [
  { key: "company_name", label: "Company name", category: "Company", description: "ClientDB → Company Name" },
  { key: "product_description", label: "Product description", category: "Company", description: "ClientDB → Product Description" },
  { key: "Matched Category", label: "Matched category", category: "Company", description: "ClientDB → Matched Category" },
  { key: "contact_name", label: "Contact name", category: "Contact", description: "KeyPersonDB → name" },
  { key: "contact_title", label: "Title", category: "Contact", description: "KeyPersonDB → Title" },
  { key: "contact_role", label: "Contact role", category: "Contact", description: "KeyPersonDB → Contact Role" },
  { key: "email", label: "Email", category: "Contact", description: "KeyPersonDB → Email" },
  { key: "phone", label: "Phone", category: "Contact", description: "KeyPersonDB → Phone" },
  { key: "owner_or_connector", label: "Owner or Connector", category: "Contact", description: "KeyPersonDB → OwnerOrConnector" },
  { key: "LinkedIn URL", label: "LinkedIn URL", category: "Contact", description: "KeyPersonDB → LinkedIn URL" },
];

export type TemplateVariableSource = {
  companyName?: string | null;
  productDescription?: string | null;
  matchedCategory?: string | null;
  contactName?: string | null;
  contactTitle?: string | null;
  contactRole?: string | null;
  email?: string | null;
  phone?: string | null;
  ownerOrConnector?: string | null;
  linkedinUrl?: string | null;
};

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

export function variableToken(key: string) {
  return `{{${key}}}`;
}

export function buildTemplateVariableContext(source: TemplateVariableSource): TemplateVariableContext {
  return {
    company_name: source.companyName?.trim() || "",
    product_description: source.productDescription?.trim() || "",
    "Matched Category": source.matchedCategory?.trim() || "",
    contact_name: source.contactName?.trim() || "",
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
  return text.replace(/{{\s*([^}]+?)\s*}}/g, (placeholder, rawKey: string) => {
    const key = rawKey.trim();
    return Object.prototype.hasOwnProperty.call(context, key) ? context[key] : placeholder;
  });
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
