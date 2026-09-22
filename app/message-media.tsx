"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { FileText, ImagePlus, Paperclip, Play, Video, X } from "lucide-react";
import { toast } from "sonner";
import {
  DEFAULT_EMAIL_ATTACHMENT_MAX_COUNT,
  DEFAULT_EMAIL_ATTACHMENT_MIME_TYPES,
  channelSupportsEmailAttachments,
} from "@/lib/email-attachments";
import {
  MAX_MEDIA_ATTACHMENTS,
  channelSupportsMedia,
  validateMediaFile,
  type MediaAttachment,
  type MediaKind,
} from "@/lib/media-attachments";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import type { Channel } from "@/lib/outreach-domain";
import { cn } from "@/lib/utils";

export type DraftMedia = MediaAttachment & {
  previewUrl: string;
  uploading?: boolean;
  error?: string;
};

type EmailUploadConfig = {
  mimeTypes: string[];
  maxBytes: number;
  maxCount: number;
  accept: string;
};

const DEFAULT_EMAIL_CONFIG: EmailUploadConfig = {
  mimeTypes: [...DEFAULT_EMAIL_ATTACHMENT_MIME_TYPES],
  maxBytes: 10 * 1024 * 1024,
  maxCount: DEFAULT_EMAIL_ATTACHMENT_MAX_COUNT,
  accept: DEFAULT_EMAIL_ATTACHMENT_MIME_TYPES.join(","),
};

function acceptFor(kind: MediaKind) {
  return kind === "image" ? "image/jpeg,image/png,image/webp,image/gif" : "video/mp4,video/quicktime,video/3gpp";
}

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${Math.round((size / (1024 * 1024)) * 10) / 10} MB`;
}

function emailKindFromMime(mimeType: string, allowed: string[]): MediaKind | null {
  const mime = mimeType.trim().toLowerCase();
  if (!mime || !allowed.includes(mime)) return null;
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  return "file";
}

function validateEmailFileClient(
  file: File,
  config: EmailUploadConfig,
): { kind: MediaKind; error?: string } | { kind?: undefined; error: string } {
  const kind = emailKindFromMime(file.type, config.mimeTypes);
  if (!kind) {
    return { error: `Unsupported file type. Allowed: ${config.mimeTypes.join(", ")}.` };
  }
  if (file.size <= 0) return { error: "This file is empty." };
  if (file.size > config.maxBytes) {
    const mb = Math.round((config.maxBytes / (1024 * 1024)) * 10) / 10;
    return { error: `Files must be ${mb} MB or smaller.` };
  }
  return { kind };
}

async function readResponsePayload(response: Response) {
  const text = await response.text();
  if (!text) return {} as Record<string, unknown>;
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    if (response.status === 413 || /payload too large/i.test(text)) {
      return { error: "File is too large for the upload proxy. Try a smaller file." };
    }
    return { error: text.slice(0, 200) || `Upload failed (${response.status})` };
  }
}

export async function uploadMediaFile(
  file: File,
  kind: MediaKind,
  options?: { purpose?: "email" | "whatsapp" },
): Promise<MediaAttachment> {
  const initResponse = await fetch("/api/media", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      kind,
      mimeType: file.type,
      fileName: file.name,
      size: file.size,
      purpose: options?.purpose,
    }),
  });
  const init = await readResponsePayload(initResponse);
  const uploadId = typeof init.uploadId === "string" ? init.uploadId : "";
  const chunkSize = typeof init.chunkSize === "number" && init.chunkSize > 0
    ? init.chunkSize
    : 512 * 1024;
  const totalChunks = typeof init.totalChunks === "number" && init.totalChunks > 0
    ? init.totalChunks
    : Math.max(1, Math.ceil(file.size / chunkSize));
  if (!initResponse.ok || !uploadId) {
    throw new Error(typeof init.error === "string" ? init.error : "Upload failed");
  }

  const buffer = await file.arrayBuffer();
  let completed: Record<string, unknown> | null = null;
  for (let index = 0; index < totalChunks; index += 1) {
    const start = index * chunkSize;
    const end = Math.min(buffer.byteLength, start + chunkSize);
    const chunkResponse = await fetch(
      `/api/media/${encodeURIComponent(uploadId)}/chunk?index=${index}&total=${totalChunks}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/octet-stream" },
        body: buffer.slice(start, end),
      },
    );
    const payload = await readResponsePayload(chunkResponse);
    if (!chunkResponse.ok) {
      throw new Error(typeof payload.error === "string" ? payload.error : `Upload chunk ${index + 1}/${totalChunks} failed`);
    }
    if (payload.done) completed = payload;
  }

  const mediaUrl = typeof completed?.mediaUrl === "string"
    ? completed.mediaUrl
    : typeof completed?.url === "string"
      ? completed.url
      : typeof init.mediaUrl === "string"
        ? init.mediaUrl
        : typeof init.url === "string"
          ? init.url
          : "";
  if (!completed?.done || !mediaUrl) {
    throw new Error("Upload did not complete");
  }
  const uploadedKind =
    completed.kind === "image" || completed.kind === "video" || completed.kind === "file"
      ? completed.kind
      : kind;
  return {
    id: typeof completed.id === "string" ? completed.id : uploadId,
    kind: uploadedKind,
    name: typeof completed.name === "string" ? completed.name : file.name,
    mimeType: typeof completed.mimeType === "string" ? completed.mimeType : file.type,
    size: typeof completed.size === "number" ? completed.size : file.size,
    url: mediaUrl,
  };
}

export function MessageMediaThumbnails({
  attachments,
  onRemove,
  onPreview,
}: {
  attachments: Array<MediaAttachment & { previewUrl?: string; uploading?: boolean; error?: string }>;
  onRemove?: (id: string) => void;
  onPreview: (item: DraftMedia | MediaAttachment) => void;
}) {
  if (!attachments.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {attachments.map((item) => (
        <div key={item.id} className="relative">
          {item.kind === "file" ? (
            <button
              type="button"
              className="group flex max-w-[14rem] items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-left"
              onClick={() => onPreview(item)}
              aria-label={`Open ${item.name}`}
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600">
                {item.uploading ? <Spinner className="size-4" /> : <FileText className="size-4" />}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-xs font-medium text-slate-800">{item.name}</span>
                <span className="block text-[10px] text-slate-500">
                  {item.error ? "Failed" : formatBytes(item.size)}
                </span>
              </span>
            </button>
          ) : (
            <button
              type="button"
              className="group relative size-16 overflow-hidden rounded-xl border border-slate-200 bg-slate-100"
              onClick={() => onPreview(item)}
              aria-label={`Preview ${item.name}`}
            >
              {item.kind === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.previewUrl || item.url} alt="" className="size-full object-cover" />
              ) : (
                <video src={item.previewUrl || item.url} className="size-full object-cover" muted playsInline />
              )}
              {item.kind === "video" && !item.uploading ? (
                <span className="absolute inset-0 grid place-items-center bg-black/25 text-white">
                  <Play className="size-4 fill-current" />
                </span>
              ) : null}
              {item.uploading ? (
                <span className="absolute inset-0 grid place-items-center bg-white/70">
                  <Spinner className="size-4" />
                </span>
              ) : null}
              {item.error ? (
                <span className="absolute inset-0 grid place-items-center bg-rose-50/90 px-1 text-[10px] font-medium text-rose-700">
                  Failed
                </span>
              ) : null}
            </button>
          )}
          {onRemove ? (
          <button
            type="button"
            className="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm hover:text-slate-900"
            aria-label={`Remove ${item.name}`}
            onClick={() => onRemove(item.id)}
          >
            <X className="size-3" />
          </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function MessageMediaAddButton({
  channel,
  disabled,
  remaining,
  emailConfig,
  onPick,
  onPickEmail,
}: {
  channel?: Channel | string | null;
  disabled?: boolean;
  remaining: number;
  emailConfig?: EmailUploadConfig;
  onPick: (files: FileList, kind: MediaKind) => void;
  onPickEmail: (files: FileList) => void;
}) {
  const imageInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const emailInput = useRef<HTMLInputElement>(null);
  const whatsapp = channelSupportsMedia(channel);
  const email = channelSupportsEmailAttachments(channel);
  if (!whatsapp && !email) return null;

  if (email) {
    return (
      <>
        <input
          ref={emailInput}
          type="file"
          accept={emailConfig?.accept || DEFAULT_EMAIL_CONFIG.accept}
          multiple
          className="hidden"
          onChange={(event) => {
            if (event.target.files?.length) onPickEmail(event.target.files);
            event.target.value = "";
          }}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="text-slate-500 hover:text-slate-900"
          disabled={disabled || remaining <= 0}
          aria-label="Add attachment"
          title="Add attachment"
          onClick={() => emailInput.current?.click()}
        >
          <Paperclip className="size-4" />
        </Button>
      </>
    );
  }

  return (
    <>
      <input
        ref={imageInput}
        type="file"
        accept={acceptFor("image")}
        className="hidden"
        onChange={(event) => {
          if (event.target.files?.length) onPick(event.target.files, "image");
          event.target.value = "";
        }}
      />
      <input
        ref={videoInput}
        type="file"
        accept={acceptFor("video")}
        className="hidden"
        onChange={(event) => {
          if (event.target.files?.length) onPick(event.target.files, "video");
          event.target.value = "";
        }}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-slate-500 hover:text-slate-900"
            disabled={disabled || remaining <= 0}
            aria-label="Add image or video"
            title="Add image or video"
          >
            <Paperclip className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="z-[80]">
          <DropdownMenuItem disabled={remaining <= 0} onSelect={() => imageInput.current?.click()}>
            <ImagePlus className="size-4" />
            Add image
          </DropdownMenuItem>
          <DropdownMenuItem disabled={remaining <= 0} onSelect={() => videoInput.current?.click()}>
            <Video className="size-4" />
            Add video
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

export function MessageMediaPreview({
  item,
  onOpenChange,
}: {
  item: DraftMedia | MediaAttachment | null;
  onOpenChange: (open: boolean) => void;
}) {
  if (!item) return null;
  if (item.kind === "file") {
    return (
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="truncate text-base">{item.name}</DialogTitle>
            <DialogDescription>
              {item.mimeType} · {formatBytes(item.size)}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end">
            <Button asChild>
              <a href={item.url} target="_blank" rel="noreferrer">
                Open file
              </a>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="px-5 pt-5 pr-12">
          <DialogTitle className="truncate text-base">{item.name}</DialogTitle>
          <DialogDescription className="sr-only">Media preview</DialogDescription>
        </DialogHeader>
        <div className="bg-slate-950 px-5 pb-5">
          {item.kind === "video" ? (
            <video
              src={"previewUrl" in item ? item.previewUrl || item.url : item.url}
              className="mx-auto max-h-[70vh] w-full rounded-lg"
              controls
              autoPlay
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={"previewUrl" in item ? item.previewUrl || item.url : item.url}
              alt={item.name}
              className="mx-auto max-h-[70vh] w-full rounded-lg object-contain"
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function useMessageMedia(channel?: Channel | string | null) {
  const [attachments, setAttachments] = useState<DraftMedia[]>([]);
  const [preview, setPreviewState] = useState<DraftMedia | null>(null);
  const [emailConfig, setEmailConfig] = useState<EmailUploadConfig>(DEFAULT_EMAIL_CONFIG);
  const attachmentsRef = useRef(attachments);
  attachmentsRef.current = attachments;
  const whatsapp = channelSupportsMedia(channel);
  const email = channelSupportsEmailAttachments(channel);
  const enabled = whatsapp || email;
  const maxCount = email ? emailConfig.maxCount : MAX_MEDIA_ATTACHMENTS;

  useEffect(() => {
    if (!email) return;
    let cancelled = false;
    void fetch("/api/media/config")
      .then(async (response) => {
        if (!response.ok) return;
        const payload = (await response.json()) as { email?: Partial<EmailUploadConfig> };
        if (cancelled || !payload.email) return;
        setEmailConfig({
          mimeTypes: Array.isArray(payload.email.mimeTypes) && payload.email.mimeTypes.length
            ? payload.email.mimeTypes
            : DEFAULT_EMAIL_CONFIG.mimeTypes,
          maxBytes: typeof payload.email.maxBytes === "number" && payload.email.maxBytes > 0
            ? payload.email.maxBytes
            : DEFAULT_EMAIL_CONFIG.maxBytes,
          maxCount: typeof payload.email.maxCount === "number" && payload.email.maxCount > 0
            ? payload.email.maxCount
            : DEFAULT_EMAIL_CONFIG.maxCount,
          accept: typeof payload.email.accept === "string" && payload.email.accept
            ? payload.email.accept
            : DEFAULT_EMAIL_CONFIG.accept,
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [email]);

  useEffect(() => {
    if (enabled) return;
    setAttachments((current) => {
      for (const item of current) {
        if (item.previewUrl.startsWith("blob:")) URL.revokeObjectURL(item.previewUrl);
      }
      return [];
    });
    setPreviewState(null);
  }, [enabled]);

  useEffect(() => () => {
    for (const item of attachmentsRef.current) {
      if (item.previewUrl.startsWith("blob:")) URL.revokeObjectURL(item.previewUrl);
    }
  }, []);

  const remaining = maxCount - attachments.length;
  const uploading = attachments.some((item) => item.uploading);
  const readyAttachments = attachments.filter((item) => !item.uploading && !item.error && item.url);

  const enqueueUpload = (file: File, kind: MediaKind, purpose: "email" | "whatsapp") => {
    const localId = `local-${crypto.randomUUID()}`;
    const previewUrl = URL.createObjectURL(file);
    const draft: DraftMedia = {
      id: localId,
      kind,
      name: file.name,
      mimeType: file.type,
      size: file.size,
      url: "",
      previewUrl,
      uploading: true,
    };
    setAttachments((current) => [...current, draft]);
    void uploadMediaFile(file, kind, { purpose })
      .then((uploaded) => {
        setAttachments((current) =>
          current.map((item) => item.id === localId ? { ...item, ...uploaded, previewUrl, uploading: false } : item),
        );
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : "Upload failed";
        toast.error(message);
        setAttachments((current) =>
          current.map((item) => item.id === localId ? { ...item, uploading: false, error: message } : item),
        );
      });
  };

  const addFiles = (list: FileList, kind: MediaKind) => {
    const room = maxCount - attachments.length;
    const files = [...list].slice(0, room);
    if (!files.length) {
      toast.error("WhatsApp allows one image or video per message.");
      return;
    }
    for (const file of files) {
      const invalid = validateMediaFile(file, kind);
      if (invalid) {
        toast.error(`${file.name}: ${invalid}`);
        continue;
      }
      enqueueUpload(file, kind, "whatsapp");
    }
  };

  const addEmailFiles = (list: FileList) => {
    const room = maxCount - attachments.length;
    const files = [...list].slice(0, room);
    if (!files.length) {
      toast.error(`Email allows up to ${maxCount} attachments per message.`);
      return;
    }
    for (const file of files) {
      const result = validateEmailFileClient(file, emailConfig);
      if (result.error || !result.kind) {
        toast.error(`${file.name}: ${result.error || "Unsupported file"}`);
        continue;
      }
      enqueueUpload(file, result.kind, "email");
    }
  };

  const remove = (id: string) => {
    setAttachments((current) => {
      const next = current.filter((item) => item.id !== id);
      const removed = current.find((item) => item.id === id);
      if (removed?.previewUrl.startsWith("blob:")) URL.revokeObjectURL(removed.previewUrl);
      return next;
    });
    setPreviewState((current) => current?.id === id ? null : current);
  };

  const reset = () => {
    setAttachments((current) => {
      if (!current.length) return current;
      for (const item of current) {
        if (item.previewUrl.startsWith("blob:")) URL.revokeObjectURL(item.previewUrl);
      }
      return [];
    });
    setPreviewState(null);
  };

  return {
    enabled,
    attachments,
    readyAttachments,
    remaining,
    uploading,
    preview,
    emailConfig,
    setPreview: (item: DraftMedia | MediaAttachment | null) => {
      if (!item) {
        setPreviewState(null);
        return;
      }
      setPreviewState({
        ...item,
        previewUrl: "previewUrl" in item && item.previewUrl ? item.previewUrl : item.url,
      });
    },
    addFiles,
    addEmailFiles,
    remove,
    reset,
  };
}

export function MessageMediaComposer({
  channel,
  media,
  className,
}: {
  channel?: Channel | string | null;
  media: ReturnType<typeof useMessageMedia>;
  className?: string;
}) {
  if (!media.enabled || (!media.attachments.length && !media.preview)) return null;
  return (
    <div className={cn("space-y-2", className)}>
      <MessageMediaThumbnails
        attachments={media.attachments}
        onRemove={media.remove}
        onPreview={media.setPreview}
      />
      <MessageMediaPreview item={media.preview} onOpenChange={(open) => { if (!open) media.setPreview(null); }} />
    </div>
  );
}

export function MessageMediaInputFrame({
  channel,
  media,
  disabled,
  children,
}: {
  channel?: Channel | string | null;
  media: ReturnType<typeof useMessageMedia>;
  disabled?: boolean;
  children: ReactNode;
}) {
  if (!media.enabled) return children;
  return (
    <div className="space-y-1.5">
      <div className="relative [&_textarea]:pb-8">
        {children}
        <div className="absolute bottom-0.5 left-0.5">
          <MessageMediaAddButton
            channel={channel}
            disabled={disabled}
            remaining={media.remaining}
            emailConfig={media.emailConfig}
            onPick={media.addFiles}
            onPickEmail={media.addEmailFiles}
          />
        </div>
      </div>
      <MessageMediaComposer channel={channel} media={media} />
    </div>
  );
}
