"use client";

import { useState } from "react";
import { splitInlineMessageMedia } from "@/lib/inline-message-media";
import type { MediaAttachment } from "@/lib/media-attachments";
import { MessageMediaPreview, VoiceMessagePlayer } from "./message-media";

export function ChannelMessageBody({
  channel,
  content,
  skipUrls = [],
}: {
  channel?: string | null;
  content: string;
  skipUrls?: string[];
}) {
  const [image, setImage] = useState<MediaAttachment | null>(null);
  if (channel !== "WhatsApp") {
    return <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{content}</p>;
  }

  const hidden = new Set(skipUrls);
  const segments = splitInlineMessageMedia(content).filter(
    (segment) => segment.type !== "media" || !hidden.has(segment.url),
  );
  if (!segments.length) return null;
  return (
    <div className="w-full min-w-0 space-y-2">
      {segments.map((segment, index) => {
        if (segment.type === "text") {
          return (
            <p key={`text-${index}`} className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">
              {segment.text}
            </p>
          );
        }
        if (segment.kind === "audio") {
          return (
            <VoiceMessagePlayer
              key={segment.url}
              src={segment.url}
              label={segment.label}
            />
          );
        }
        return (
          <button
            key={segment.url}
            type="button"
            className="block max-w-xs overflow-hidden rounded-xl border border-black/10 bg-white text-left"
            aria-label={`View ${segment.label}`}
            onClick={() => setImage({
              id: segment.url,
              kind: "image",
              name: segment.label,
              mimeType: "image/jpeg",
              size: 0,
              url: segment.url,
            })}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={segment.url} alt="" className="max-h-64 w-full object-contain" />
          </button>
        );
      })}
      <MessageMediaPreview item={image} onOpenChange={(open) => { if (!open) setImage(null); }} />
    </div>
  );
}
