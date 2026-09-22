"use client";

import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { Bold, ImagePlus, Italic, Link2, List, ListOrdered, Underline as UnderlineIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { containsInlineBase64 } from "@/lib/email-html";
import { cn } from "@/lib/utils";
import { uploadMediaFile } from "./message-media";

function isHttpsUrl(url: string) {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

async function uploadAndInsert(editor: Editor, files: File[]) {
  const images = files.filter((file) => file.type.startsWith("image/"));
  if (!images.length) return false;
  for (const file of images) {
    const uploaded = await uploadMediaFile(file, "image", { purpose: "email" });
    editor.chain().focus().setImage({ src: uploaded.url, alt: file.name }).run();
  }
  return true;
}

export function EmailBodyEditor({
  value,
  onChange,
  disabled,
  placeholder = "Write an email…",
  className,
}: {
  value: string;
  onChange: (html: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const [uploading, setUploading] = useState(false);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const handleImageFiles = (files: File[]) => {
    const current = editorRef.current;
    if (!current || !files.length) return;
    setUploading(true);
    void uploadAndInsert(current, files)
      .then((handled) => {
        if (!handled) return;
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : "Image upload failed");
      })
      .finally(() => setUploading(false));
  };

  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        codeBlock: false,
        code: false,
        link: {
          openOnClick: false,
          autolink: true,
          HTMLAttributes: { rel: "noopener noreferrer" },
        },
      }),
      Image.configure({
        allowBase64: false,
        inline: false,
      }),
      Placeholder.configure({ placeholder }),
    ],
    content: value || "",
    editorProps: {
      attributes: {
        class:
          "min-h-28 px-3 py-2 pb-10 text-sm leading-6 text-slate-800 outline-none [&_img]:max-h-40 [&_img]:max-w-full [&_img]:rounded-md",
      },
      handlePaste(_view, event) {
        const files = event.clipboardData?.files;
        if (!files?.length) return false;
        const images = Array.from(files).filter((file) => file.type.startsWith("image/"));
        if (!images.length) return false;
        event.preventDefault();
        handleImageFiles(images);
        return true;
      },
      handleDrop(_view, event) {
        const files = event.dataTransfer?.files;
        if (!files?.length) return false;
        const images = Array.from(files).filter((file) => file.type.startsWith("image/"));
        if (!images.length) return false;
        event.preventDefault();
        handleImageFiles(images);
        return true;
      },
    },
    onUpdate: ({ editor: current }) => {
      const html = current.getHTML();
      if (containsInlineBase64(html)) {
        current.commands.undo();
        toast.error("Paste the image file itself so it can be uploaded to S3.");
        return;
      }
      onChangeRef.current(html);
    },
  });

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [disabled, editor]);

  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if (!value && !editor.isEmpty) {
      editor.commands.clearContent();
      return;
    }
    if (value && value !== current) {
      editor.commands.setContent(value);
    }
  }, [editor, value]);

  const setLink = () => {
    if (!editor) return;
    const previous = editor.getAttributes("link").href as string | undefined;
    const next = window.prompt("Link URL", previous || "https://");
    if (next == null) return;
    const trimmed = next.trim();
    if (!trimmed) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    if (!isHttpsUrl(trimmed) && !trimmed.toLowerCase().startsWith("mailto:")) {
      toast.error("Use an https or mailto link.");
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: trimmed }).run();
  };

  return (
    <div
      data-slot="email-editor"
      className={cn(
        "relative overflow-hidden rounded-md border border-input bg-white",
        disabled && "opacity-60",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-200 px-1 py-1">
        <ToolbarButton
          label="Bold"
          active={editor?.isActive("bold")}
          disabled={!editor || disabled}
          onClick={() => editor?.chain().focus().toggleBold().run()}
        >
          <Bold />
        </ToolbarButton>
        <ToolbarButton
          label="Italic"
          active={editor?.isActive("italic")}
          disabled={!editor || disabled}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        >
          <Italic />
        </ToolbarButton>
        <ToolbarButton
          label="Underline"
          active={editor?.isActive("underline")}
          disabled={!editor || disabled}
          onClick={() => editor?.chain().focus().toggleUnderline().run()}
        >
          <UnderlineIcon />
        </ToolbarButton>
        <ToolbarButton
          label="Bullet list"
          active={editor?.isActive("bulletList")}
          disabled={!editor || disabled}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
        >
          <List />
        </ToolbarButton>
        <ToolbarButton
          label="Numbered list"
          active={editor?.isActive("orderedList")}
          disabled={!editor || disabled}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered />
        </ToolbarButton>
        <ToolbarButton label="Link" active={editor?.isActive("link")} disabled={!editor || disabled} onClick={setLink}>
          <Link2 />
        </ToolbarButton>
        <ToolbarButton
          label="Insert image"
          disabled={!editor || disabled || uploading}
          onClick={() => fileRef.current?.click()}
        >
          <ImagePlus />
        </ToolbarButton>
      </div>
      <div className="min-h-28 max-h-60 overflow-y-auto overscroll-contain">
        <EditorContent editor={editor} />
      </div>
      {uploading ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-2 text-center text-[11px] text-slate-500">
          Uploading image…
        </div>
      ) : null}
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={(event) => {
          handleImageFiles(Array.from(event.target.files || []));
          if (fileRef.current) fileRef.current.value = "";
        }}
      />
    </div>
  );
}

function ToolbarButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant={active ? "secondary" : "ghost"}
      size="icon-xs"
      disabled={disabled}
      title={label}
      aria-label={label}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
