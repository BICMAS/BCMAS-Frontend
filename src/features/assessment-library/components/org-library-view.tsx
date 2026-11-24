"use client";

import { CopyIcon, EyeIcon, LibraryIcon, PlusIcon, SearchIcon, SparklesIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { listRoleRecords } from "@/features/roles/services/mock-roles";
import type { RoleRecord } from "@/features/roles/types";
import { cn } from "@/lib/utils";

import { roleCompetencies } from "../services/ai-builder";
import { listPublishedMasters } from "../services/central-library";
import {
  copyFromMaster,
  createOrgAssessment,
  listOrgAssessments,
  orgCounts,
  type OrgAssessmentSummary,
} from "../services/org-library";
import { LibraryError } from "../services/versioning";
import { ASSESSMENT_TYPE_LABEL, ORG_VERSION_STATUS_LABEL, type TemplateVersion } from "../types";
import { VersionBadge, fieldSelectClass } from "./library-shared";
import { OrgLibraryGate, UseTemplateDialog, useOrgLibraryRevision, useRoleOptions } from "./org-shared";
import { PreviewDialog } from "./preview-compare-dialogs";
import { TemplateFormDialog } from "./template-form-dialog";

type Tab = "mine" | "browse" | "drafts" | "in_review" | "active" | "retired";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "mine", label: "My Assessments" },
  { id: "browse", label: "Browse BCMS Library" },
  { id: "drafts", label: "Drafts" },
  { id: "in_review", label: "In Review" },
  { id: "active", label: "Approved / Active" },
  { id: "retired", label: "Retired" },
];

export function OrgLibraryView() {
  return <OrgLibraryGate>{(ctx) => <OrgLibrary {...ctx} />}</OrgLibraryGate>;
}

type Master = { templateId: string; version: TemplateVersion };

function OrgLibrary({ organisationId, actor }: { organisationId: string; actor: string }) {
  const router = useRouter();
  const revision = useOrgLibraryRevision();
  const roles = useRoleOptions();
  const [tab, setTab] = useState<Tab>("mine");
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [copying, setCopying] = useState<{ templateId: string; name: string; version: string } | null>(null);
  const [preview, setPreview] = useState<TemplateVersion | null>(null);

  const { mine, counts, masters } = useMemo(() => {
    void revision;
    return {
      mine: listOrgAssessments(organisationId),
      counts: orgCounts(organisationId),
      masters: listPublishedMasters(),
    };
  }, [organisationId, revision]);

  const q = search.trim().toLowerCase();
  const rows = mine.filter((a) => {
    if (tab === "drafts" && !a.hasDraft) return false;
    if (tab === "in_review" && !a.inReview) return false;
    if (tab === "active" && !a.active) return false;
    if (tab === "retired" && a.lifecycle !== "retired") return false;
    return !q || `${a.name} ${a.linkedRole ?? ""} ${a.source?.templateName ?? ""}`.toLowerCase().includes(q);
  });
  const masterRows = masters.filter(
    (m) => !q || `${m.version.name} ${m.version.roleFamily} ${m.version.competencies.join(" ")}`.toLowerCase().includes(q),
  );

  function copy(input: { name: string; linkedRole: string | null }) {
    if (!copying) return;
    try {
      const id = copyFromMaster(organisationId, copying.templateId, input, actor);
      setCopying(null);
      toast.success("Organisation copy created as a draft. The BCMS master is unchanged.");
      router.push(`/talent/library/${id}`);
    } catch (error) {
      toast.error(error instanceof LibraryError ? error.message : "Could not copy the template.");
    }
  }

  const columns: DataTableColumn<OrgAssessmentSummary>[] = [
    { id: "name", header: "Assessment", cell: (row) => <span className="font-bold text-navy">{row.name}</span> },
    {
      id: "source",
      header: "Source",
      cell: (row) =>
        row.source ? (
          <span className="text-slate-600">
            BCMS Master v{row.source.version}
            <span className="block text-[10px] text-slate-400">{row.source.templateName}</span>
          </span>
        ) : (
          <span className="text-slate-600">Organisation created</span>
        ),
    },
    { id: "role", header: "Role", cell: (row) => row.linkedRole ?? "—" },
    { id: "items", header: "Items", cell: (row) => row.itemCount },
    {
      id: "status",
      header: "Version / Status",
      cell: (row) => (
        <div className="flex flex-wrap gap-1.5">
          {row.lifecycle === "retired" ? (
            <VersionBadge status="retired" version={row.version} />
          ) : row.active ? (
            <VersionBadge status="published" version={row.version} label={ORG_VERSION_STATUS_LABEL.published} />
          ) : null}
          {row.hasDraft || row.inReview ? (
            <VersionBadge
              status={row.inReview ? "in_review" : "draft"}
              version={row.pending?.version ?? row.version}
            />
          ) : null}
        </div>
      ),
    },
  ];

  const masterColumns: DataTableColumn<Master>[] = [
    {
      id: "name",
      header: "BCMS template",
      cell: (row) => (
        <div>
          <p className="font-bold text-navy">{row.version.name}</p>
          <p className="text-[10px] text-slate-400">{row.version.competencies.join(" · ")}</p>
        </div>
      ),
    },
    { id: "type", header: "Assessment type", cell: (row) => ASSESSMENT_TYPE_LABEL[row.version.assessmentType] },
    { id: "family", header: "Role family", cell: (row) => row.version.roleFamily },
    { id: "items", header: "Items", cell: (row) => row.version.items.length },
    { id: "version", header: "Version", cell: (row) => <Badge variant="success">v{row.version.version} Published</Badge> },
    {
      id: "actions",
      header: "Actions",
      headerClassName: "text-right",
      className: "text-right",
      cell: (row) => (
        <div className="flex justify-end gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={`Preview ${row.version.name}`}
            onClick={(e) => {
              e.stopPropagation();
              setPreview(row.version);
            }}
          >
            <EyeIcon aria-hidden />
            Preview
          </Button>
          <Button
            type="button"
            size="sm"
            aria-label={`Use template ${row.version.name}`}
            onClick={(e) => {
              e.stopPropagation();
              setCopying({ templateId: row.templateId, name: row.version.name, version: row.version.version });
            }}
          >
            <CopyIcon aria-hidden />
            Use Template
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Organisation Assessment Library"
        description="Manage your organisation's own assessments. Start from a published BCMS template or create your own; your copies never change the BCMS master."
        actions={
          <>
            <Button type="button" variant="secondary" onClick={() => setTab("browse")}>
              <LibraryIcon aria-hidden />
              Browse BCMS Library
            </Button>
            <Button type="button" variant="secondary" onClick={() => setGenerating(true)}>
              <SparklesIcon aria-hidden />
              Generate with AI
            </Button>
            <Button type="button" onClick={() => setCreating(true)}>
              <PlusIcon aria-hidden />
              Create Assessment
            </Button>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          ["Organisation assessments", counts.all],
          ["Drafts", counts.drafts],
          ["In review", counts.inReview],
          ["Approved / Active", counts.approved],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-border-slate bg-white p-5 shadow-sm">
            <p className="text-2xl font-bold text-navy">{value}</p>
            <p className="text-xs text-slate-500">{label}</p>
          </div>
        ))}
      </div>

      <div role="tablist" aria-label="Library view" className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-xs font-bold",
              tab === t.id ? "border-navy bg-navy text-white" : "border-border-slate bg-white text-navy hover:bg-slate-50",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="relative mb-4 max-w-sm">
        <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={tab === "browse" ? "Search BCMS templates…" : "Search your assessments…"}
          className="pl-9"
          aria-label="Search"
        />
      </div>

      {tab === "browse" ? (
        <>
          <p className="mb-3 text-sm text-slate-500">
            Published BCMS master templates, read-only. Use Template to create your organisation&apos;s own copy.
          </p>
          <DataTable
            columns={masterColumns}
            data={masterRows}
            getRowId={(row) => row.templateId}
            onRowClick={(row) => router.push(`/talent/library/bcms/${row.templateId}`)}
            emptyMessage="No published BCMS templates match your search."
          />
        </>
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          getRowId={(row) => row.id}
          onRowClick={(row) => router.push(`/talent/library/${row.id}`)}
          emptyMessage={
            tab === "mine" ? "No organisation assessments yet. Browse the BCMS Library to start from a template." : "Nothing here."
          }
        />
      )}
      <p className="mt-3 text-xs text-slate-400">
        BCMS assessments are role-based assessments developed by BICMAS, not scientifically validated psychometric tests.{" "}
        <Link href="/talent" className="font-bold text-navy hover:underline">
          Back to Talent Assessment
        </Link>
      </p>

      <UseTemplateDialog
        master={copying}
        organisationId={organisationId}
        onOpenChange={(open) => !open && setCopying(null)}
        onConfirm={copy}
      />
      <TemplateFormDialog
        open={creating}
        onOpenChange={setCreating}
        title="Create organisation assessment"
        description="Start an assessment from scratch for your organisation. It begins as a draft."
        submitLabel="Create draft"
        roleField={{ initial: null, options: roles }}
        onSubmit={(settings, linkedRole) => {
          const id = createOrgAssessment(organisationId, settings, linkedRole, actor);
          setCreating(false);
          toast.success("Draft assessment created. Add questions, then submit it for approval.");
          router.push(`/talent/library/${id}`);
        }}
      />
      <PreviewDialog version={preview} onOpenChange={(open) => !open && setPreview(null)} />
      <GenerateWithAiDialog
        open={generating}
        onOpenChange={setGenerating}
        onStart={(role, name) => {
          const id = createOrgAssessment(
            organisationId,
            {
              name,
              purpose: `Assess the competencies required for the ${role.title} role.`,
              assessmentType: "technical_competency",
              roleFamily: role.departmentName,
              targetProficiency: "Proficient",
              competencies: roleCompetencies(role).map((c) => c.name),
              durationMinutes: 30,
            },
            role.title,
            actor,
          );
          setGenerating(false);
          router.push(`/talent/library/${id}/builder`);
        }}
      />
    </div>
  );
}

/** Starts an empty draft for a role and opens the AI Assessment Builder on it. */
function GenerateWithAiDialog({
  open,
  onOpenChange,
  onStart,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStart: (role: RoleRecord, name: string) => void;
}) {
  const roles = useMemo(
    () => listRoleRecords().filter((role) => role.status === "approved" || role.status === "published"),
    [],
  );
  const [roleId, setRoleId] = useState(roles[0]?.id ?? "");
  const [name, setName] = useState("");
  const role = roles.find((r) => r.id === roleId);
  const finalName = name.trim() || (role ? `${role.title} – AI assisted` : "");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generate with AI</DialogTitle>
          <DialogDescription>
            Start a draft assessment for an approved role profile. The AI Assessment Builder then drafts questions for you
            to review. Nothing is used until it is approved.
          </DialogDescription>
        </DialogHeader>
        <label className="text-xs font-bold text-navy">
          Approved role profile
          <select className={fieldSelectClass} value={roleId} onChange={(e) => setRoleId(e.target.value)}>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-bold text-navy">
          Assessment name
          <Input className="mt-1" value={name} placeholder={finalName} maxLength={120} onChange={(e) => setName(e.target.value)} />
        </label>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={!role} onClick={() => role && onStart(role, finalName)}>
            <SparklesIcon aria-hidden />
            Open AI Assessment Builder
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
