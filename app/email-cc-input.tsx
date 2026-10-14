"use client";

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { Contact } from "@/lib/outreach-domain";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

function splitEmails(value: string) {
  return value.split(/[;,]/).map(email => email.trim()).filter(Boolean);
}

export function EmailCcInput({
  contacts,
  value,
  onChange,
  disabled,
}: {
  contacts: Contact[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const keyPeople = useMemo(() => {
    const seen = new Set<string>();
    return contacts.filter(contact => {
      const email = contact.email?.trim().toLowerCase();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || seen.has(email)) return false;
      seen.add(email);
      return true;
    });
  }, [contacts]);
  const selected = new Set(splitEmails(value).map(email => email.toLowerCase()));

  function toggleEmail(email: string, checked: boolean) {
    const next = splitEmails(value).filter(item => item.toLowerCase() !== email.toLowerCase());
    if (checked) next.push(email.trim());
    onChange(next.join("; "));
  }

  return (
    <div className="flex min-w-0 gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" className="shrink-0" disabled={disabled}>
            Key People <ChevronDown className="ml-1 size-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 p-2">
          <p className="px-2 py-1 text-sm font-medium">Add Key People to CC</p>
          {keyPeople.length ? (
            <div className="max-h-60 overflow-y-auto">
              {keyPeople.map(contact => {
                const email = contact.email!.trim();
                return (
                  <label key={contact.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-slate-50">
                    <Checkbox checked={selected.has(email.toLowerCase())} onCheckedChange={checked => toggleEmail(email, checked === true)} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{contact.name} · {contact.role}</span>
                      <span className="block truncate text-xs text-slate-500">{email}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          ) : (
            <p className="px-2 py-3 text-sm text-slate-500">No Key People with an email address.</p>
          )}
        </PopoverContent>
      </Popover>
      <Input
        value={value}
        onChange={event => onChange(event.target.value)}
        onKeyDown={event => {
          if (event.key !== " " || event.currentTarget.selectionStart !== value.length || event.currentTarget.selectionEnd !== value.length) return;
          const trimmed = value.trimEnd();
          const lastAddress = trimmed.split(/[;,]/).at(-1)?.trim();
          if (!lastAddress || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lastAddress)) return;
          event.preventDefault();
          onChange(`${trimmed}; `);
        }}
        placeholder="CC email addresses (separate with ;)"
        disabled={disabled}
        aria-label="CC email addresses"
      />
    </div>
  );
}
