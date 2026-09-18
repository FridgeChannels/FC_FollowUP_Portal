"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ImagePlus, Paperclip, Play, Video, X } from "lucide-react";
import { toast } from "sonner";
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

function acceptFor(kind: MediaKind) {
  return kind === "image" ? "image/jpeg,image/png,image/webp,image/gif" : "video/mp4,video/quicktime,video/3gpp";
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

export async function uploadMediaFile(file: File, kind: MediaKind): Promise<MediaAttachment> {
  const initResponse = await fetch("/api/media", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      kind,
      mimeType: file.type,
      fileName: file.name,
      size: file.size,
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
  return {
    id: typeof completed.id === "string" ? completed.id : uploadId,
    kind,
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
  onPick,
}: {
  channel?: Channel | string | null;
  disabled?: boolean;
  remaining: number;
  onPick: (files: FileList, kind: MediaKind) => void;
}) {
  const imageInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  if (!channelSupportsMedia(channel)) return null;
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
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="px-5 pt-5 pr-12">
          <DialogTitle className="truncate text-base">{item.name}</DialogTitle>
          <DialogDescription className="sr-only">Media preview</DialogDescription>
        </DialogHeader>
        <div className="bg-slate-950 px-5 pb-5">
          {"kind" in item && item.kind === "video" ? (
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
  const [preview, setPreview] = useState<DraftMedia | null>(null);
  const attachmentsRef = useRef(attachments);
  attachmentsRef.current = attachments;
  const enabled = channelSupportsMedia(channel);

  useEffect(() => {
    if (enabled) return;
    setAttachments((current) => {
      for (const item of current) {
        if (item.previewUrl.startsWith("blob:")) URL.revokeObjectURL(item.previewUrl);
      }
      return [];
    });
    setPreview(null);
  }, [enabled]);

  useEffect(() => () => {
    for (const item of attachmentsRef.current) {
      if (item.previewUrl.startsWith("blob:")) URL.revokeObjectURL(item.previewUrl);
    }
  }, []);

  const remaining = MAX_MEDIA_ATTACHMENTS - attachments.length;
  const uploading = attachments.some((item) => item.uploading);
  const readyAttachments = attachments.filter((item) => !item.uploading && !item.error && item.url);

  const addFiles = (list: FileList, kind: MediaKind) => {
    const room = MAX_MEDIA_ATTACHMENTS - attachments.length;
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
      void uploadMediaFile(file, kind)
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
    }
  };

  const remove = (id: string) => {
    setAttachments((current) => {
      const next = current.filter((item) => item.id !== id);
      const removed = current.find((item) => item.id === id);
      if (removed?.previewUrl.startsWith("blob:")) URL.revokeObjectURL(removed.previewUrl);
      return next;
    });
    setPreview((current) => current?.id === id ? null : current);
  };

  const reset = () => {
    setAttachments((current) => {
      if (!current.length) return current;
      for (const item of current) {
        if (item.previewUrl.startsWith("blob:")) URL.revokeObjectURL(item.previewUrl);
      }
      return [];
    });
    setPreview(null);
  };

  return {
    enabled,
    attachments,
    readyAttachments,
    remaining,
    uploading,
    preview,
    setPreview,
    addFiles,
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
            onPick={media.addFiles}
          />
        </div>
      </div>
      <MessageMediaComposer channel={channel} media={media} />
    </div>
  );
}
