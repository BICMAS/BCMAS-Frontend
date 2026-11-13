"use client";

import Link from "next/link";
import { useRef, useState, type DragEvent } from "react";
import {
  CheckIcon,
  ClockIcon,
  CloudUploadIcon,
  FileSpreadsheetIcon,
  Loader2Icon,
} from "lucide-react";
import { toast } from "sonner";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  ORG_UPLOAD_ACCEPT,
  ORG_UPLOAD_MAX_BYTES,
  uploadOrgStructure,
} from "@/features/organisation/services/mock-organisation";
import type { OrgUploadRecord } from "@/features/organisation/types";
import { cn } from "@/lib/utils";

type BulkUploadViewProps = {
  initialUploads: OrgUploadRecord[];
};

function isAcceptedFile(file: File) {
  const name = file.name.toLowerCase();
  return (
    name.endsWith(".csv") ||
    name.endsWith(".xls") ||
    name.endsWith(".xlsx")
  );
}

export function BulkUploadView({ initialUploads }: BulkUploadViewProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState(initialUploads);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedName, setSelectedName] = useState<string | null>(null);

  const processFile = async (file: File) => {
    if (!isAcceptedFile(file)) {
      toast.error("Unsupported file type. Use .csv, .xls, or .xlsx.");
      return;
    }
    if (file.size > ORG_UPLOAD_MAX_BYTES) {
      toast.error("File exceeds the 25MB limit.");
      return;
    }

    setSelectedName(file.name);
    setUploading(true);
    try {
      const record = await uploadOrgStructure(file);
      setUploads((prev) => [record, ...prev]);
      toast.success(`Uploaded ${file.name}`);
    } catch {
      toast.error("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void processFile(file);
  };

  const downloadTemplate = (kind: "xlsx" | "csv") => {
    const content =
      kind === "csv"
        ? "department_id,department_name,parent_id,role_title\nit,Information Technology,,Senior Solutions Architect\n"
        : "BCMS Structure Template (mock .xlsx placeholder)";
    const blob = new Blob([content], {
      type:
        kind === "csv"
          ? "text/csv;charset=utf-8"
          : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download =
      kind === "csv" ? "bcms-org-sample.csv" : "bcms-org-structure-template.xlsx";
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success(
      kind === "csv" ? "Sample CSV downloaded" : "Structure template downloaded",
    );
  };

  return (
    <div>
      <Breadcrumb>
        <BreadcrumbList className="mb-4 text-[11px] font-bold tracking-[0.1em] text-slate-400 uppercase">
          <BreadcrumbItem>
            <BreadcrumbLink href="/org">Organization</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="text-navy">Bulk Upload</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mb-10">
        <h1 className="mb-2 text-3xl font-bold tracking-tight text-navy">
          Bulk Org Structure Upload
        </h1>
        <p className="max-w-2xl leading-relaxed text-slate-500">
          Import departments, sub-departments, and roles at scale using our
          CSV/XLSX template. AI will automatically attempt to map parent-child
          relationships based on your data.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                inputRef.current?.click();
              }
            }}
            onDragEnter={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setDragging(false);
            }}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            className={cn(
              "group mb-8 cursor-pointer rounded-2xl border-2 border-dashed border-border-slate bg-white p-12 text-center transition-all hover:border-green-lime",
              dragging && "border-green-lime bg-green-lime/5",
              uploading && "pointer-events-none opacity-70",
            )}
          >
            <div className="mx-auto mb-6 flex size-20 items-center justify-center rounded-full bg-slate-50 transition-all group-hover:bg-green-lime/10">
              {uploading ? (
                <Loader2Icon className="size-8 animate-spin text-green-deep" />
              ) : (
                <CloudUploadIcon className="size-8 text-slate-300 transition-all group-hover:text-green-deep" />
              )}
            </div>
            <h3 className="mb-2 text-xl font-bold text-navy">
              {uploading
                ? "Uploading…"
                : selectedName
                  ? selectedName
                  : "Drag and drop your file here"}
            </h3>
            <p className="mb-8 text-sm text-slate-400">
              Support for .csv, .xls, .xlsx files (Max 25MB)
            </p>
            <Button
              type="button"
              className="shadow-md"
              disabled={uploading}
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
              accept={ORG_UPLOAD_ACCEPT}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void processFile(file);
                e.target.value = "";
              }}
            />
          </div>

          <div className="rounded-xl border border-border-slate bg-white p-8">
            <h3 className="mb-6 font-bold text-navy">How to prepare your file</h3>
            <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
              {[
                "Download the structure template and fill in your department and role data.",
                "Ensure unique IDs are used for departments to maintain parent-child mapping.",
                "Map role titles to their respective department IDs.",
                "Upload and review AI-assisted relationship suggestions before publishing.",
              ].map((step, index) => (
                <div key={step} className="flex gap-4">
                  <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold">
                    {index + 1}
                  </div>
                  <p className="text-sm text-slate-600">{step}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border border-border-slate bg-white p-6 shadow-sm">
            <h4 className="mb-4 font-bold text-navy">Resources</h4>
            <button
              type="button"
              onClick={() => downloadTemplate("xlsx")}
              className="mb-3 flex w-full items-center gap-3 rounded-lg border border-border-slate p-3 text-left transition-all hover:bg-slate-50"
            >
              <FileSpreadsheetIcon className="size-4 text-green-deep" aria-hidden />
              <div>
                <p className="text-sm leading-none font-bold text-navy">
                  Structure Template
                </p>
                <p className="mt-1 text-[10px] text-slate-400">
                  Excel Format (.xlsx)
                </p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => downloadTemplate("csv")}
              className="flex w-full items-center gap-3 rounded-lg border border-border-slate p-3 text-left transition-all hover:bg-slate-50"
            >
              <FileSpreadsheetIcon className="size-4 text-navy" aria-hidden />
              <div>
                <p className="text-sm leading-none font-bold text-navy">
                  Sample CSV
                </p>
                <p className="mt-1 text-[10px] text-slate-400">
                  Standard CSV (.csv)
                </p>
              </div>
            </button>
          </div>

          <div className="rounded-xl border border-border-slate bg-white p-6 shadow-sm">
            <h4 className="mb-4 font-bold text-navy">Recent Uploads</h4>
            <div className="space-y-4">
              {uploads.map((upload) => (
                <div
                  key={upload.id}
                  className={cn(
                    "flex items-start gap-3",
                    upload.status === "archived" && "opacity-60",
                  )}
                >
                  <div
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded",
                      upload.status === "completed"
                        ? "bg-green-50"
                        : "bg-slate-100",
                    )}
                  >
                    {upload.status === "completed" ? (
                      <CheckIcon className="size-3 text-green-deep" aria-hidden />
                    ) : (
                      <ClockIcon className="size-3 text-slate-400" aria-hidden />
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-bold text-navy">{upload.fileName}</p>
                    <p className="mt-1 text-[10px] tracking-widest text-slate-400 uppercase">
                      {upload.status === "completed"
                        ? "Completed"
                        : upload.status === "archived"
                          ? "Archived"
                          : upload.status}{" "}
                      • {upload.relativeTime}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <p className="text-center text-xs text-slate-400">
            Return to{" "}
            <Link href="/org" className="font-semibold text-navy hover:underline">
              Organisation Overview
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
