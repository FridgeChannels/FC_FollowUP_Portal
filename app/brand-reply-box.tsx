"use client";

import { useEffect, useRef, useState } from "react";
import { MoreHorizontal, Send, X } from "lucide-react";
import { toast } from "sonner";
import { Channel, Contact, Interaction, ScheduledAction, WorkspaceState, interactionSortAt, interactionSortMs } from "@/lib/outreach-domain";
import { useWorkspace } from "./workspace-store";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { easternDateTimeLocalToIso } from "@/lib/scheduling-engine/calendar";
import { BUSINESS_TIME_ZONE } from "@/lib/time-zone";
import { SendTimingToggle, type DeliveryMode } from "./send-timing-toggle";
import { MessageMediaInputFrame, useMessageMedia } from "./message-media";
import { EmailBodyEditor } from "./email-body-editor";
import { emailBodyIsEmpty } from "@/lib/email-html";
import type { MediaAttachment } from "@/lib/media-attachments";
import { channelAvailable } from "@/lib/channel-availability";
import { EmailCcInput } from "./email-cc-input";
import { EmailHtmlBody } from "./email-html-body";

const show = (result: { ok: boolean; message: string }) => result.ok ? toast.success(result.message) : toast.error(result.message);

function activityTime(value?: string) {
  if (!value) return 0;
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00.000Z` : value;
  const time = Date.parse(normalized);
  return Number.isNaN(time) ? 0 : time;
}

function sameConversation(left: Interaction, right: Interaction) {
  if (left.customerId !== right.customerId) return false;
  if (left.contactId && right.contactId && left.contactId !== right.contactId) return false;
  if (left.channel && right.channel && left.channel !== right.channel) return false;
  if (left.threadId || right.threadId) return !!left.threadId && left.threadId === right.threadId;
  if (left.taskId || right.taskId) return !!left.taskId && left.taskId === right.taskId;
  if (left.bombInstanceId && right.bombInstanceId) return left.bombInstanceId === right.bombInstanceId;
  return false;
}

function isHumanOutbound(item: Interaction) {
  return item.direction === "Outbound" && item.creationMethod === "Manual";
}

function hasLaterHumanOutbound(inbound: Interaction, interactions: Interaction[]) {
  const inboundAt = activityTime(inbound.createdAt);
  return interactions.some(item =>
    isHumanOutbound(item) &&
    sameConversation(item, inbound) &&
    activityTime(item.createdAt) > inboundAt
  );
}

function laterThan(left: Interaction, right: Interaction) {
  const leftTime = activityTime(left.createdAt);
  const rightTime = activityTime(right.createdAt);
  return leftTime > rightTime || (leftTime === rightTime && left.id.localeCompare(right.id) > 0);
}

function inboundIsAwaitingReply(inbound: Interaction, interactions: Interaction[]) {
  if (inbound.direction !== "Inbound") return false;
  if (inbound.replyStatus === "Replied") return false;
  if (inbound.replyStatus === "Needs Reply") return true;
  return !hasLaterHumanOutbound(inbound, interactions);
}

export function inboundNeedsComposer(_state: WorkspaceState, inbound: Interaction, interactions = _state.interactions) {
  if (!inboundIsAwaitingReply(inbound, interactions)) return false;
  return !interactions.some(item =>
    item.id !== inbound.id &&
    inboundIsAwaitingReply(item, interactions) &&
    sameConversation(item, inbound) &&
    laterThan(item, inbound)
  );
}

/** Message the sender will quote: the newest email that actually reached Gmail (received, or sent). */
function latestQuotableEmail(items: Interaction[]) {
  return items
    .filter(item =>
      item.channel === "Email" &&
      (item.direction === "Inbound" || (item.direction === "Outbound" && item.taskStatus === "Completed")),
    )
    .sort((left, right) => interactionSortMs(left) - interactionSortMs(right))
    .at(-1);
}

const quoteDateFormat = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: BUSINESS_TIME_ZONE });
const quoteTimeFormat = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: BUSINESS_TIME_ZONE });

function quoteAttribution(message: Interaction, contacts: Contact[]) {
  const at = interactionSortAt(message);
  const date = at ? new Date(at) : null;
  const when = date && !Number.isNaN(date.getTime()) ? `On ${quoteDateFormat.format(date)} at ${quoteTimeFormat.format(date)}` : "On";
  const address = message.sender?.trim();
  const name = message.direction === "Inbound" ? contacts.find(item => item.id === message.contactId)?.name : undefined;
  const who = address ? `${name ? `${name} ` : ""}<${address}>` : name || "";
  return `${when} ${who} wrote:`.replace(/\s+/g, " ");
}

/** Gmail's collapsed "•••" quoted history; removing it sends the reply without the quote. */
function QuotedHistory({
  message,
  contacts,
  removed,
  onRemovedChange,
  disabled,
}: {
  message: Interaction;
  contacts: Contact[];
  removed: boolean;
  onRemovedChange: (removed: boolean) => void;
  disabled?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  if (removed) {
    return (
      <div className="text-xs text-slate-400">
        Quoted text removed ·{" "}
        <button type="button" className="underline underline-offset-2 hover:text-slate-600" disabled={disabled} onClick={() => onRemovedChange(false)}>Undo</button>
      </div>
    );
  }
  return (
    <div className="min-w-0 space-y-2">
      <button
        type="button"
        className="inline-flex h-3.5 items-center rounded-full bg-slate-200 px-1.5 text-slate-600 hover:bg-slate-300"
        aria-expanded={expanded}
        aria-label={expanded ? "Hide quoted text" : "Show quoted text"}
        title={expanded ? "Hide quoted text" : "Show trimmed content"}
        onClick={() => setExpanded(value => !value)}
      >
        <MoreHorizontal className="size-4" />
      </button>
      {expanded ? (
        <div className="relative min-w-0 rounded-md border border-input bg-white px-3 py-2">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="absolute right-1 top-1"
            aria-label="Remove quoted text"
            title="Remove quoted text"
            disabled={disabled}
            onClick={() => onRemovedChange(true)}
          >
            <X />
          </Button>
          <div className="email-html pr-7">{quoteAttribution(message, contacts)}</div>
          <blockquote className="mt-1 ml-[0.8ex] max-h-72 overflow-y-auto border-l border-[#ccc] pl-[1ex]">
            <EmailHtmlBody html={message.content} />
          </blockquote>
        </div>
      ) : null}
    </div>
  );
}

export function BrandReplyBox({
  customerId,
  interaction,
  bombInstanceId,
  contacts,
  interactions,
  actions,
  taskId,
  onSend,
  open = true,
  replyToThisMessage = false,
  onClose,
}: {
  customerId: string;
  interaction: Interaction;
  bombInstanceId?: string;
  contacts?: Contact[];
  interactions?: Interaction[];
  actions?: ScheduledAction[];
  taskId?: string;
  onSend?: (contactId: string, channel: Channel, content: string, taskId?: string, threadId?: string, subject?: string, deliveryMode?: DeliveryMode, scheduledAt?: string, attachments?: MediaAttachment[], cc?: string, options?: { quoteHistory?: boolean }) => Promise<void>;
  open?: boolean;
  replyToThisMessage?: boolean;
  onClose?: () => void;
}) {
  const { state, can, sendHumanReply } = useWorkspace();
  const customer = state.customers.find(item => item.id === customerId);
  const people = contacts || customer?.contacts || [];
  const [content, setContent] = useState("");
  const [subject, setSubject] = useState(() =>
    interaction.channel === "Email" && interaction.title !== "Email" ? interaction.title : "",
  );
  const [cc, setCc] = useState("");
  const [quoteRemoved, setQuoteRemoved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>("queue");
  const [scheduledAt, setScheduledAt] = useState("");
  const contact = people.find(item => item.id === interaction.contactId) || people[0];
  const channel = interaction.channel;
  const media = useMessageMedia(channel);
  const notionBacked = !!onSend;
  const composerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open || !replyToThisMessage) return;
    const composer = composerRef.current;
    if (!composer) return;
    composer.scrollIntoView({ block: "nearest", behavior: "smooth" });
    const focusEditor = () => {
      const editor = composer.querySelector<HTMLElement>('[contenteditable="true"], textarea');
      editor?.focus({ preventScroll: true });
      return !!editor;
    };
    if (focusEditor()) return;
    // The email editor mounts after its initial render.
    const observer = new MutationObserver(() => { if (focusEditor()) observer.disconnect(); });
    observer.observe(composer, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [open, replyToThisMessage]);
  if (!open) return null;
  if (!can("reply") || !people.length) return null;
  if (!notionBacked && customer?.status === "Closed") return null;
  if (replyToThisMessage
    ? !inboundIsAwaitingReply(interaction, interactions || state.interactions)
    : !inboundNeedsComposer(state, interaction, interactions)) return null;
  if (!contact || !channel) return null;
  const replyTaskId = interaction.taskId || actions?.find(item => item.bombInstanceId === bombInstanceId && item.channel === channel)?.id || taskId;
  const hasBody = (channel === "Email" ? !emailBodyIsEmpty(content) : !!content.trim()) || media.readyAttachments.length > 0;
  const busy = saving;
  const canSend = hasBody && !(channel === "Email" && !subject.trim()) && !busy && !media.uploading;
  const quoted = channel === "Email"
    ? latestQuotableEmail([interaction, ...(interactions || state.interactions).filter(item => item.id !== interaction.id && sameConversation(item, interaction))])
    : undefined;
  return (
    <div ref={composerRef} data-reply-composer={interaction.id} className="mt-3 min-w-0 space-y-2 py-3">
      <div className="flex items-center justify-between gap-2 text-xs font-medium text-slate-600">
        <span>Reply to {contact.name} · {channel}</span>
        {onClose && <Button type="button" variant="ghost" size="icon" className="size-11 shrink-0" aria-label="Close reply" onClick={onClose}><X className="size-4" /></Button>}
      </div>
      <div className="min-w-0 space-y-2">
        {channel === "Email" && <Input value={subject} onChange={event => setSubject(event.target.value)} placeholder="Email subject" disabled={busy} />}
        {channel === "Email" && <EmailCcInput contacts={people} value={cc} onChange={setCc} disabled={busy} />}
        <MessageMediaInputFrame channel={channel} media={media} disabled={busy}>
          {channel === "Email" ? (
            <EmailBodyEditor value={content} onChange={setContent} disabled={busy} placeholder="Write a reply…" />
          ) : (
            <Textarea value={content} onChange={event => setContent(event.target.value)} className="min-h-20 resize-none" placeholder="Write a reply…" disabled={busy} />
          )}
        </MessageMediaInputFrame>
        {quoted && notionBacked ? (
          <QuotedHistory message={quoted} contacts={people} removed={quoteRemoved} onRemovedChange={setQuoteRemoved} disabled={busy} />
        ) : null}
        <div className="flex items-center justify-end gap-2">
          <div className="flex items-center gap-2">
          <SendTimingToggle value={deliveryMode} onValueChange={setDeliveryMode} scheduledAt={scheduledAt} onScheduledAtChange={setScheduledAt} />
          <Button className="h-9 px-3" disabled={!canSend} aria-busy={saving} onClick={() => {
          if (onSend) {
            setSaving(true);
            void onSend(contact.id, channel, content, replyTaskId, interaction.threadId, subject, deliveryMode, scheduledAt ? easternDateTimeLocalToIso(scheduledAt) : undefined, media.readyAttachments, channel === "Email" ? cc : undefined, quoteRemoved ? { quoteHistory: false } : undefined)
              .then(() => { toast.success("Message saved as pending"); setContent(""); setSubject(""); setCc(""); setQuoteRemoved(false); media.reset(); })
              .catch(error => toast.error(error instanceof Error ? error.message : "Send failed"))
              .finally(() => setSaving(false));
            return;
          }
          if (!customer) return;
          const result = sendHumanReply(customer.id, contact.id, channel, content, bombInstanceId || interaction.bombInstanceId);
          show(result);
          if (result.ok) { setContent(""); media.reset(); }
          }}>{saving ? <><Spinner className="size-4"/>{deliveryMode === "immediate" ? "Sending…" : deliveryMode === "scheduled" ? "Scheduling…" : "Queuing…"}</> : <><Send className="size-4"/>Send</>}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function threadEmailSubject(thread: Interaction[]) {
  for (let index = thread.length - 1; index >= 0; index -= 1) {
    const item = thread[index]!;
    if (item.channel !== "Email") continue;
    const subject = item.title?.trim();
    if (!subject || subject === "Email" || subject === "Conversation") continue;
    return subject;
  }
  return "";
}

function threadSendContext(thread: Interaction[]) {
  const withThreadId = [...thread].reverse().find((item) => item.threadId);
  const latestOutbound = [...thread].reverse().find((item) => item.direction === "Outbound");
  return {
    threadId: withThreadId?.threadId || latestOutbound?.threadId || thread.at(-1)?.threadId,
    taskId: latestOutbound?.taskId || withThreadId?.taskId || thread.at(-1)?.taskId,
    bombInstanceId: latestOutbound?.bombInstanceId || withThreadId?.bombInstanceId,
  };
}

/** Bottom composer for an opened Email thread when nothing in that thread awaits reply. */
export function ThreadSendBox({
  customerId,
  channel,
  contact: defaultContact,
  contacts,
  thread,
  interactions,
  onSend,
}: {
  customerId: string;
  channel: Channel;
  contact?: Contact;
  contacts: Contact[];
  thread: Interaction[];
  interactions: Interaction[];
  onSend?: (contactId: string, channel: Channel, content: string, taskId?: string, threadId?: string, subject?: string, deliveryMode?: DeliveryMode, scheduledAt?: string, attachments?: MediaAttachment[], cc?: string, options?: { quoteHistory?: boolean }) => Promise<void>;
}) {
  const { state, can, sendHumanReply } = useWorkspace();
  const customer = state.customers.find((item) => item.id === customerId);
  const notionBacked = !!onSend;
  const people = contacts.filter((item) => channelAvailable(item, channel));
  const initialContactId = (defaultContact && channelAvailable(defaultContact, channel) ? defaultContact.id : null)
    || people[0]?.id
    || "";
  const prefilledSubject = channel === "Email" ? threadEmailSubject(thread) : "";
  const [contactId, setContactId] = useState(initialContactId);
  const [content, setContent] = useState("");
  const [subject, setSubject] = useState(prefilledSubject);
  const [cc, setCc] = useState("");
  const [quoteRemoved, setQuoteRemoved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>("queue");
  const [scheduledAt, setScheduledAt] = useState("");
  const media = useMessageMedia(channel);
  const threadKey = thread.map((item) => item.id).join(",");

  useEffect(() => {
    const nextId = (defaultContact && channelAvailable(defaultContact, channel) ? defaultContact.id : null)
      || people[0]?.id
      || "";
    setContactId(nextId);
    setContent("");
    setSubject(channel === "Email" ? threadEmailSubject(thread) : "");
    setCc("");
    setQuoteRemoved(false);
    setDeliveryMode("queue");
    setScheduledAt("");
    media.reset();
  }, [channel, customerId, defaultContact?.id, threadKey]);

  const contact = people.find((item) => item.id === contactId) || people[0];
  const threadHasPendingReply = thread.some((item) => inboundNeedsComposer(state, item, interactions));
  if (!can("reply")) return null;
  if (!notionBacked && customer?.status === "Closed") return null;
  if (threadHasPendingReply) return null;
  if (!people.length) {
    return <div className="border-t border-slate-200 px-5 py-4 text-sm text-slate-400">No contact has a valid {channel} endpoint.</div>;
  }

  const { threadId, taskId, bombInstanceId } = threadSendContext(thread);
  const hasBody = (channel === "Email" ? !emailBodyIsEmpty(content) : !!content.trim()) || media.readyAttachments.length > 0;
  const busy = saving;
  const canSend = !!contact && hasBody && !(channel === "Email" && !subject.trim()) && !busy && !media.uploading;
  const quoted = channel === "Email" && threadId ? latestQuotableEmail(thread) : undefined;

  return (
    <div className="border-t border-slate-200 px-5 py-4">
      <div className="rounded-xl bg-slate-50 p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
          <Select value={contact?.id} onValueChange={setContactId} disabled={busy}>
            <SelectTrigger size="sm" className="w-56">
              <SelectValue placeholder="Recipient" />
            </SelectTrigger>
            <SelectContent>
              {people.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name}{item.email ? ` · ${item.email}` : item.role ? ` · ${item.role}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-slate-400">Send {channel}</span>
        </div>
        <div className="min-w-0 space-y-2">
          {channel === "Email" && <Input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Email subject" disabled={busy} />}
          {channel === "Email" && <EmailCcInput contacts={contacts} value={cc} onChange={setCc} disabled={busy} />}
          <MessageMediaInputFrame channel={channel} media={media} disabled={busy}>
            {channel === "Email" ? (
              <EmailBodyEditor value={content} onChange={setContent} disabled={busy} placeholder="Write a follow-up…" />
            ) : (
              <Textarea value={content} onChange={(event) => setContent(event.target.value)} className="min-h-20 resize-none" placeholder={`Write a ${channel} message…`} disabled={busy} />
            )}
          </MessageMediaInputFrame>
          {quoted && notionBacked ? (
            <QuotedHistory message={quoted} contacts={contacts} removed={quoteRemoved} onRemovedChange={setQuoteRemoved} disabled={busy} />
          ) : null}
          <div className="flex items-center justify-end gap-2">
            <div className="flex items-center gap-2">
              <SendTimingToggle value={deliveryMode} onValueChange={setDeliveryMode} scheduledAt={scheduledAt} onScheduledAtChange={setScheduledAt} />
              <Button
                className="h-9 px-3"
                disabled={!canSend}
                aria-busy={saving}
                aria-label={saving ? `${deliveryMode === "queue" ? "Queuing" : deliveryMode === "scheduled" ? "Scheduling" : "Sending"} message` : "Send message"}
                title={saving ? `${deliveryMode === "queue" ? "Queuing" : deliveryMode === "scheduled" ? "Scheduling" : "Sending"}…` : "Send message"}
                onClick={() => {
                  if (!contact) return;
                  if (onSend) {
                    setSaving(true);
                    void onSend(
                      contact.id,
                      channel,
                      content,
                      taskId,
                      threadId,
                      channel === "Email" ? subject : undefined,
                      deliveryMode,
                      scheduledAt ? easternDateTimeLocalToIso(scheduledAt) : undefined,
                      media.readyAttachments,
                      channel === "Email" ? cc : undefined,
                      quoteRemoved ? { quoteHistory: false } : undefined,
                    )
                      .then(() => {
                        toast.success("Message saved as pending");
                        setContent("");
                        setCc("");
                        setQuoteRemoved(false);
                        media.reset();
                      })
                      .catch((error) => toast.error(error instanceof Error ? error.message : "Send failed"))
                      .finally(() => setSaving(false));
                    return;
                  }
                  const result = sendHumanReply(customerId, contact.id, channel, content, bombInstanceId);
                  show(result);
                  if (result.ok) {
                    setContent("");
                    media.reset();
                  }
                }}
              >
                {saving ? <Spinner className="size-4" /> : <Send className="size-4" />}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ChannelSendBox({
  customerId,
  channel,
  contacts,
  interactions,
  onSend,
}: {
  customerId?: string;
  channel: Channel;
  contacts: Contact[];
  interactions: Interaction[];
  onSend?: (contactId: string, channel: Channel, content: string, taskId?: string, threadId?: string, subject?: string, deliveryMode?: DeliveryMode, scheduledAt?: string, attachments?: MediaAttachment[], cc?: string, options?: { quoteHistory?: boolean }) => Promise<void>;
}) {
  const { state, can, sendHumanReply } = useWorkspace();
  const people = contacts.filter(item => channelAvailable(item, channel));
  const latest = [...interactions]
    .filter(item => item.contactId && people.some(person => person.id === item.contactId))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
  const [contactId, setContactId] = useState(latest?.contactId || people[0]?.id || "");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>("queue");
  const [scheduledAt, setScheduledAt] = useState("");
  const media = useMessageMedia(channel);
  useEffect(() => {
    setContactId(latest?.contactId || people[0]?.id || "");
    setContent("");
    setDeliveryMode("queue");
    setScheduledAt("");
    media.reset();
  }, [channel, customerId]);
  const contact = people.find(item => item.id === contactId) || people[0];
  const customer = state.customers.find(item => item.id === customerId);
  const channelHasPendingReply = interactions.some(item => item.channel === channel && inboundNeedsComposer(state, item, interactions));
  if (!can("reply") || !customerId) return null;
  if (!onSend && customer?.status === "Closed") return null;
  if (channelHasPendingReply) return null;
  if (!people.length) {
    return <div className="border-t border-slate-200 px-5 py-4 text-sm text-slate-400">No contact has a valid {channel} endpoint.</div>;
  }

  const pool = interactions.filter(item => item.contactId === contact?.id && item.channel === channel);
  const latestOutbound = [...pool].reverse().find(item => item.direction === "Outbound");
  const threadId = latestOutbound?.threadId || pool.at(-1)?.threadId;
  const taskId = latestOutbound?.taskId || pool.at(-1)?.taskId;

  return (
    <div className="border-t border-slate-200 px-5 py-4">
      <div className="rounded-xl bg-slate-50 p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
          <Select value={contact?.id} onValueChange={setContactId}>
            <SelectTrigger size="sm" className="w-44"><SelectValue placeholder="KeyPerson"/></SelectTrigger>
            <SelectContent>{people.map(item => <SelectItem key={item.id} value={item.id}>{item.name} · {item.role}</SelectItem>)}</SelectContent>
          </Select>
          <span className="text-xs text-slate-400">Send {channel}</span>
        </div>
        <div className="space-y-2">
          <MessageMediaInputFrame channel={channel} media={media} disabled={saving}>
            <Textarea
              value={content}
              onChange={event => setContent(event.target.value)}
              className="min-h-20 resize-none"
              placeholder={`Write ${channel === "Phone" ? "a call note" : `a ${channel} message`}…`}
            />
          </MessageMediaInputFrame>
          <div className="flex items-center justify-end gap-2">
            <div className="flex items-center gap-2">
            <SendTimingToggle value={deliveryMode} onValueChange={setDeliveryMode} scheduledAt={scheduledAt} onScheduledAtChange={setScheduledAt} />
            <Button className="h-9 px-3" disabled={!contact || (!content.trim() && !media.readyAttachments.length) || saving || media.uploading} aria-busy={saving} onClick={() => {
            if (!contact) return;
            if (onSend) {
              setSaving(true);
              void onSend(contact.id, channel, content, taskId, threadId, undefined, deliveryMode, scheduledAt ? easternDateTimeLocalToIso(scheduledAt) : undefined, media.readyAttachments)
                .then(() => { toast.success("Message saved as pending"); setContent(""); media.reset(); })
                .catch(error => toast.error(error instanceof Error ? error.message : "Send failed"))
                .finally(() => setSaving(false));
              return;
            }
            const result = sendHumanReply(customerId, contact.id, channel, content, latestOutbound?.bombInstanceId);
            show(result);
            if (result.ok) { setContent(""); media.reset(); }
            }} aria-label={saving ? `${deliveryMode === "queue" ? "Queuing" : deliveryMode === "scheduled" ? "Scheduling" : "Sending"} message` : "Send message"} title={saving ? `${deliveryMode === "queue" ? "Queuing" : deliveryMode === "scheduled" ? "Scheduling" : "Sending"}…` : "Send message"}>{saving ? <Spinner className="size-4"/> : <Send className="size-4"/>}</Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
