import type { BombCustomVariable, Contact, Customer, User } from "./outreach-domain";

export type TemplateVariableCategory = "Contact" | "Brand" | "Sender" | "Custom";

export type TemplateVariable = {
  key: string;
  label: string;
  category: Exclude<TemplateVariableCategory, "Custom">;
  description: string;
};

export const templateVariables: TemplateVariable[] = [
  { key: "first_name", label: "First name", category: "Contact", description: "The selected contact's first name" },
  { key: "last_name", label: "Last name", category: "Contact", description: "The selected contact's last name" },
  { key: "contact.name", label: "Full name", category: "Contact", description: "The selected contact's full name" },
  { key: "contact.role", label: "Role", category: "Contact", description: "The selected contact's role" },
  { key: "contact.email", label: "Email", category: "Contact", description: "The selected contact's email" },
  { key: "owner.first_name", label: "Owner first name", category: "Contact", description: "The Brand's Owner contact" },
  { key: "brand.name", label: "Brand name", category: "Brand", description: "The Brand's name" },
  { key: "brand.source", label: "Brand source", category: "Brand", description: "Where the Brand came from" },
  { key: "brand.cp", label: "CP stage", category: "Brand", description: "The Brand's current CP stage" },
  { key: "sender.first_name", label: "Sender first name", category: "Sender", description: "The FC teammate launching OmniReach" },
  { key: "sender.name", label: "Sender name", category: "Sender", description: "The FC teammate launching OmniReach" },
];

const nameParts = (name?: string) => (name || "").trim().split(/\s+/).filter(Boolean);

export function variableToken(key: string) {
  return `{{${key}}}`;
}

export function resolveTemplateVariables(
  text: string | undefined,
  {
    contact,
    customer,
    sender,
    customVariables = [],
  }: {
    contact: Contact;
    customer: Customer;
    sender?: User;
    customVariables?: BombCustomVariable[];
  },
) {
  if (!text) return text || "";
  const contactName = nameParts(contact.name);
  const owner = customer.contacts.find((item) => item.role === "Owner");
  const ownerName = nameParts(owner?.name);
  const senderName = nameParts(sender?.name);
  const values: Record<string, string | undefined> = {
    first_name: contactName[0],
    last_name: contactName.slice(1).join(" "),
    "contact.first_name": contactName[0],
    "contact.last_name": contactName.slice(1).join(" "),
    "contact.name": contact.name,
    "contact.role": contact.role,
    "contact.email": contact.email,
    "owner.first_name": ownerName[0],
    "brand.name": customer.name,
    "brand.source": customer.source,
    "brand.cp": customer.cp,
    "sender.first_name": senderName[0],
    "sender.name": sender?.name,
  };
  customVariables.forEach((item) => {
    values[`variable.${item.key}`] = item.defaultValue;
  });

  return text.replace(/{{\s*([^}]+?)\s*}}/g, (placeholder, rawKey: string) => {
    const key = rawKey.trim();
    return Object.prototype.hasOwnProperty.call(values, key) ? values[key] || "" : placeholder;
  });
}
