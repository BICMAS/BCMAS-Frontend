"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RoleStatusBadge } from "@/features/roles/components/role-status-badge";
import { restoreProfileVersion } from "@/features/roles/services/mock-roles";
import type { RoleProfileVersion, RoleRecord } from "@/features/roles/types";

type ProfileHistoryViewProps = {
  role: RoleRecord;
};

export function ProfileHistoryView({ role }: ProfileHistoryViewProps) {
  const router = useRouter();
  const [versions, setVersions] = useState(role.profileVersions);
  const [compareA, setCompareA] = useState(versions[0]?.id ?? "");
  const [compareB, setCompareB] = useState(versions[1]?.id ?? "");
  const [restoreTarget, setRestoreTarget] = useState<RoleProfileVersion | null>(
    null,
  );
  const [restoring, setRestoring] = useState(false);

  const left = versions.find((v) => v.id === compareA);
  const right = versions.find((v) => v.id === compareB);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Profile History & Audit"
        description={`Version history for ${role.title}.`}
        actions={
          <Button
            type="button"
            variant="secondary"
            onClick={() => router.push(`/roles/${role.id}`)}
          >
            Back to role
          </Button>
        }
      />

      <div className="grid gap-4 rounded-xl border border-border-slate bg-white p-6 shadow-sm md:grid-cols-2">
        <label className="text-xs font-bold tracking-wider text-slate-500 uppercase">
          Compare A
          <select
            className="mt-2 h-11 w-full rounded-lg border border-border-slate bg-slate-50 px-4 text-sm"
            value={compareA}
            onChange={(e) => setCompareA(e.target.value)}
          >
            {versions.map((v) => (
              <option key={v.id} value={v.id}>
                {v.version} · {v.changedAt}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-bold tracking-wider text-slate-500 uppercase">
          Compare B
          <select
            className="mt-2 h-11 w-full rounded-lg border border-border-slate bg-slate-50 px-4 text-sm"
            value={compareB}
            onChange={(e) => setCompareB(e.target.value)}
          >
            {versions.map((v) => (
              <option key={v.id} value={v.id}>
                {v.version} · {v.changedAt}
              </option>
            ))}
          </select>
        </label>
        <div className="rounded-lg border border-border-slate bg-slate-50 p-4 md:col-span-1">
          <p className="mb-2 text-sm font-bold text-navy">
            {left?.version ?? "—"}
          </p>
          <p className="text-xs text-slate-500">{left?.summary}</p>
        </div>
        <div className="rounded-lg border border-border-slate bg-slate-50 p-4 md:col-span-1">
          <p className="mb-2 text-sm font-bold text-navy">
            {right?.version ?? "—"}
          </p>
          <p className="text-xs text-slate-500">{right?.summary}</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border-slate bg-white shadow-sm">
        <div className="divide-y divide-border-slate">
          {versions.length === 0 ? (
            <p className="p-8 text-sm text-slate-500">No versions recorded yet.</p>
          ) : (
            versions.map((version) => (
              <div
                key={version.id}
                className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <p className="font-bold text-navy">{version.version}</p>
                    <RoleStatusBadge status={version.status} />
                  </div>
                  <p className="text-sm text-slate-500">{version.summary}</p>
                  <p className="mt-1 text-[10px] font-bold tracking-widest text-slate-400 uppercase">
                    {version.changedBy} · {version.changedAt}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setRestoreTarget(version)}
                >
                  Restore
                </Button>
              </div>
            ))
          )}
        </div>
      </div>

      <Dialog
        open={Boolean(restoreTarget)}
        onOpenChange={(open) => {
          if (!open) setRestoreTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restore profile version?</DialogTitle>
            <DialogDescription>
              {restoreTarget
                ? `Restore ${restoreTarget.version} as the current draft (mock).`
                : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="-mx-6 -mb-6">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setRestoreTarget(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={restoring}
              onClick={async () => {
                if (!restoreTarget) return;
                setRestoring(true);
                try {
                  const updated = await restoreProfileVersion(
                    role.id,
                    restoreTarget.id,
                  );
                  if (updated) {
                    setVersions(updated.profileVersions);
                    toast.success(`Restored ${restoreTarget.version}`);
                  }
                  setRestoreTarget(null);
                } finally {
                  setRestoring(false);
                }
              }}
            >
              {restoring ? (
                <>
                  <Loader2Icon className="size-4 animate-spin" />
                  Restoring…
                </>
              ) : (
                "Restore"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
