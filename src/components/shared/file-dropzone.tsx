"use client";

import { useRef, useState, type DragEvent, type ReactNode } from "react";
import { CloudUploadIcon, Loader2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type FileDropzoneProps = {
  accept?: string;
  maxBytes?: number;
  loading?: boolean;
  disabled?: boolean;
  title?: string;
  hint?: string;
  selectedName?: string | null;
  onFile: (file: File) => void | Promise<void>;
  onInvalid?: (message: string) => void;
  className?: string;
  footer?: ReactNode;
};

function matchesAccept(file: File, accept?: string) {
  if (!accept) return true;
  const tokens = accept.split(",").map((t) => t.trim().toLowerCase());
  const name = file.name.toLowerCase();
  return tokens.some((token) => {
    if (token.startsWith(".")) return name.endsWith(token);
    return file.type === token;
  });
}

/**
 * Drag-and-drop / file picker surface for mock import flows.
 */
export function FileDropzone({
  accept = ".csv,.xls,.xlsx",
  maxBytes = 25 * 1024 * 1024,
  loading,
  disabled,
  title = "Drag and drop your file here",
  hint = "Support for .csv, .xls, .xlsx files (Max 25MB)",
  selectedName,
  onFile,
  onInvalid,
  className,
  footer,
}: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleFile = async (file: File) => {
    if (!matchesAccept(file, accept)) {
      onInvalid?.("Unsupported file type.");
      return;
    }
    if (file.size > maxBytes) {
      onInvalid?.("File exceeds the size limit.");
      return;
    }
    await onFile(file);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-disabled={disabled || loading}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if (!disabled && !loading) inputRef.current?.click();
        }
      }}
      onDragEnter={(e) => {
        e.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setDragging(false);
      }}
      onDrop={onDrop}
      onClick={() => {
        if (!disabled && !loading) inputRef.current?.click();
      }}
      className={cn(
        "group cursor-pointer rounded-2xl border-2 border-dashed border-border-slate bg-white p-12 text-center transition-all hover:border-green-lime",
        dragging && "border-green-lime bg-green-lime/5",
        (loading || disabled) && "pointer-events-none opacity-70",
        className,
      )}
    >
      <div className="mx-auto mb-6 flex size-20 items-center justify-center rounded-full bg-slate-50 transition-all group-hover:bg-green-lime/10">
        {loading ? (
          <Loader2Icon className="size-8 animate-spin text-green-deep" />
        ) : (
          <CloudUploadIcon className="size-8 text-slate-300 transition-all group-hover:text-green-deep" />
        )}
      </div>
      <h3 className="mb-2 text-xl font-bold text-navy">
        {loading ? "Uploading…" : selectedName || title}
      </h3>
      <p className="mb-8 text-sm text-slate-400">{hint}</p>
      <Button
        type="button"
        className="shadow-md"
        disabled={loading || disabled}
        onClick={(e) => {
          e.stopPropagation();
          inputRef.current?.click();
        }}
      >
        Choose File
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.target.value = "";
        }}
      />
      {footer}
    </div>
  );
}
