"use client";

import type { ReactNode } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Channel, Contact, uid } from "@/lib/outreach-domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type ContactDraft = {
  id: string;
  name: string;
  role: Contact["role"];
  email: string;
  phone: string;
  whatsapp: string;
  linkedin: string;
};

const ROLES: Contact["role"][] = ["Connector", "Owner", "Other"];

export function emptyContactDraft(role: Contact["role"] = "Connector"): ContactDraft {
  return { id: uid("ct"), name: "", role, email: "", phone: "", whatsapp: "", linkedin: "" };
}

export function validContactDrafts(drafts: ContactDraft[]) {
  return drafts.filter((item) => item.name.trim());
}

const normalizeLinkedin = (value?: string) =>
  value?.trim().replace(/^https?:\/\/(www\.)?linkedin\.com\/in\//i, "").replace(/\/$/, "") || undefined;

export function contactFromDraft(draft: ContactDraft): Contact {
  const email = draft.email.trim() || undefined;
  const phone = draft.phone.trim() || undefined;
  const whatsapp = draft.whatsapp.trim() || undefined;
  const linkedin = normalizeLinkedin(draft.linkedin);
  const preferredChannel: Channel = email ? "Email" : phone ? "Phone" : whatsapp ? "WhatsApp" : linkedin ? "LinkedIn" : "Email";
  return {
    id: draft.id,
    name: draft.name.trim(),
    role: ROLES.includes(draft.role) ? draft.role : "Connector",
    email,
    phone,
    whatsapp,
    linkedin,
    preferredChannel,
    emailValid: !!email,
    phoneValid: !!phone,
  };
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-1.5 text-xs font-medium text-slate-600">
      {label}
      {children}
    </label>
  );
}

export function ContactFields({
  value,
  onChange,
}: {
  value: ContactDraft;
  onChange: (next: ContactDraft) => void;
}) {
  const patch = (partial: Partial<ContactDraft>) => onChange({ ...value, ...partial });
  return (
    <div className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Contact name">
          <Input
            value={value.name}
            onChange={(e) => patch({ name: e.target.value })}
            placeholder="KeyPerson"
          />
        </Field>
        <Field label="Role">
          <Select value={value.role} onValueChange={(role) => patch({ role: role as Contact["role"] })}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLES.map((role) => (
                <SelectItem key={role} value={role}>
                  {role}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Email">
          <Input
            value={value.email}
            onChange={(e) => patch({ email: e.target.value })}
            placeholder="name@brand.co"
          />
        </Field>
        <Field label="Phone">
          <Input
            value={value.phone}
            onChange={(e) => patch({ phone: e.target.value })}
            placeholder="+1 415 555 0100"
          />
        </Field>
        <Field label="WhatsApp">
          <Input
            value={value.whatsapp}
            onChange={(e) => patch({ whatsapp: e.target.value })}
            placeholder="+1 415 555 0100"
          />
        </Field>
        <Field label="LinkedIn">
          <Input
            value={value.linkedin}
            onChange={(e) => patch({ linkedin: e.target.value })}
            placeholder="linkedin.com/in/handle"
          />
        </Field>
      </div>
    </div>
  );
}

export function BrandContactsEditor({
  contacts,
  onChange,
}: {
  contacts: ContactDraft[];
  onChange: (contacts: ContactDraft[]) => void;
}) {
  const update = (id: string, next: ContactDraft) =>
    onChange(contacts.map((item) => (item.id === id ? next : item)));
  const remove = (id: string) => {
    if (contacts.length <= 1) {
      onChange([emptyContactDraft()]);
      return;
    }
    onChange(contacts.filter((item) => item.id !== id));
  };
  return (
    <section className="grid gap-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium">KeyPerson</div>
          <p className="text-xs text-slate-500">Add every contact that belongs to this brand.</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="bg-white"
          onClick={() => onChange([...contacts, emptyContactDraft()])}
        >
          <Plus className="size-3.5" />
          Add contact
        </Button>
      </div>
      <div className="grid gap-3">
        {contacts.map((contact, index) => (
          <div key={contact.id} className="rounded-xl border bg-slate-50/80 p-3">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="text-xs font-semibold text-slate-500">Contact {index + 1}</div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Remove contact"
                onClick={() => remove(contact.id)}
              >
                <Trash2 className="size-3.5 text-slate-400" />
              </Button>
            </div>
            <ContactFields value={contact} onChange={(next) => update(contact.id, next)} />
          </div>
        ))}
      </div>
    </section>
  );
}
