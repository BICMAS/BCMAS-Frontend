"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckIcon, ClockIcon, FileSpreadsheetIcon } from "lucide-react";
import { toast } from "sonner";

import { FileDropzone } from "@/components/shared/file-dropzone";
import { PageHeader } from "@/components/shared/page-header";
import { uploadEmployees } from "@/features/employees/services/mock-employees";
import type { EmployeeImportRecord } from "@/features/employees/types";
import { cn } from "@/lib/utils";

type EmployeeImportViewProps = {
  initialImports: EmployeeImportRecord[];
};

export function EmployeeImportView({
  initialImports,
}: EmployeeImportViewProps) {
  const [imports, setImports] = useState(initialImports);
  const [uploading, setUploading] = useState(false);
  const [selectedName, setSelectedName] = useState<string | null>(null);

  const downloadTemplate = () => {
    const csv =
      "employee_code,full_name,email,department_id,role_title\nEMP-1001,Ada Lovelace,ada@gec.example,it,Senior Solutions Architect\n";
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "bcms-employee-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Template downloaded");
  };

  return (
    <div>
      <PageHeader
        title="Bulk Employee Import"
        description="Import workforce records at scale. Mapping and exceptions remain available in the Capability Mapping module."
      />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <FileDropzone
            loading={uploading}
            selectedName={selectedName}
            onInvalid={(message) => toast.error(message)}
            onFile={async (file) => {
              setSelectedName(file.name);
              setUploading(true);
              try {
                const record = await uploadEmployees(file);
                setImports((prev) => [record, ...prev]);
                toast.success(`Imported ${file.name} (mock)`);
              } finally {
                setUploading(false);
              }
            }}
            className="mb-8"
          />
          <div className="rounded-xl border border-border-slate bg-white p-8">
            <h3 className="mb-4 font-bold text-navy">Prepare your file</h3>
            <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-600">
              <li>Download the CSV template.</li>
              <li>Include unique employee codes.</li>
              <li>Map optional role titles where known.</li>
              <li>Upload and review mapping exceptions afterwards.</li>
            </ol>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border border-border-slate bg-white p-6 shadow-sm">
            <h4 className="mb-4 font-bold text-navy">Resources</h4>
            <button
              type="button"
              onClick={downloadTemplate}
              className="flex w-full items-center gap-3 rounded-lg border border-border-slate p-3 text-left hover:bg-slate-50"
            >
              <FileSpreadsheetIcon className="size-4 text-green-deep" />
              <span>
                <span className="block text-sm font-bold text-navy">
                  Employee Template
                </span>
                <span className="text-[10px] text-slate-400">CSV (.csv)</span>
              </span>
            </button>
          </div>

          <div className="rounded-xl border border-border-slate bg-white p-6 shadow-sm">
            <h4 className="mb-4 font-bold text-navy">Recent Uploads</h4>
            <div className="space-y-4">
              {imports.map((item) => (
                <div
                  key={item.id}
                  className={cn(
                    "flex items-start gap-3",
                    item.status === "archived" && "opacity-60",
                  )}
                >
                  <div
                    className={cn(
                      "flex size-8 items-center justify-center rounded",
                      item.status === "completed"
                        ? "bg-green-50"
                        : "bg-slate-100",
                    )}
                  >
                    {item.status === "completed" ? (
                      <CheckIcon className="size-3 text-green-deep" />
                    ) : (
                      <ClockIcon className="size-3 text-slate-400" />
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-bold text-navy">{item.fileName}</p>
                    <p className="mt-1 text-[10px] tracking-widest text-slate-400 uppercase">
                      {item.status} · {item.relativeTime}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <p className="text-center text-xs text-slate-400">
            <Link href="/employees" className="font-semibold text-navy hover:underline">
              Back to directory
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
