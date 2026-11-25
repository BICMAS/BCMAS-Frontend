"use client";


import type { UserPortal } from "@/types";
import { useMemo, useState, useSyncExternalStore, type ReactNode } from "react";

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
import { useHydratedUser } from "@/features/talent/use-hydrated-user";
import { useSessionStore } from "@/stores/session-store";

import { libraryRevision, subscribeLibrary } from "../services/central-library";
import { canApproveOrgAssessments, canManageOrgLibrary, copiesOfMaster, orgLibraryRevision, subscribeOrgLibrary } from "../services/org-library";

function subscribeBoth(listener: () => void) {
  const a = subscribeOrgLibrary(listener);
  const b = subscribeLibrary(listener);
  return () => {
    a();
    b();
  };
}

/** Re-renders when either library changes (org screens also show published masters). */
export function useOrgLibraryRevision() {
  return useSyncExternalStore(subscribeBoth, () => orgLibraryRevision() * 100_000 + libraryRevision(), () => 0);
}

/** HRBP area, scoped to the signed-in organisation. `approvers` also lets the HR Admin in. */
export function OrgLibraryGate({
  children,
  approvers = false,
}: {
  children: (ctx: { organisationId: string; actor: string; portal: UserPortal }) => ReactNode;
  approvers?: boolean;
}) {
  const user = useHydratedUser();
  const organisationId = useSessionStore((state) => state.organisationId);
  if (!user) return null;
  if (!canManageOrgLibrary(user.portal) && !(approvers && canApproveOrgAssessments(user.portal))) {
    return <p className="text-sm text-slate-500">The organisation assessment library is for HRBPs.</p>;
  }
  return <>{children({ organisationId, actor: user.name, portal: user.portal })}</>;
}

/** Role titles from the organisation's role profiles, for the "Linked role" field. */
export function useRoleOptions() {
  return useMemo(() => [...new Set(listRoleRecords().map((role) => role.title))].sort(), []);
}

/** "Use Template": name the organisation copy and optionally link it to a role. */
export function UseTemplateDialog({
  master,
  organisationId,
  onOpenChange,
  onConfirm,
}: {
  master: { templateId: string; name: string; version: string } | null;
  organisationId: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: (input: { name: string; linkedRole: string | null }) => void;
}) {
  return (
    <Dialog open={master !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        {master ? (
          <UseTemplateForm
            key={master.templateId}
            master={master}
            organisationId={organisationId}
            onCancel={() => onOpenChange(false)}
            onConfirm={onConfirm}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function UseTemplateForm({
  master,
  organisationId,
  onCancel,
  onConfirm,
}: {
  master: { templateId: string; name: string; version: string };
  organisationId: string;
  onCancel: () => void;
  onConfirm: (input: { name: string; linkedRole: string | null }) => void;
}) {
  const roles = useRoleOptions();
  const [name, setName] = useState(`${master.name.replace(/ – Core$/, "")} – Custom`);
  const [role, setRole] = useState("");
  const existing = copiesOfMaster(organisationId, master.templateId);

  return (
    <>
      <DialogHeader>
        <DialogTitle>Use template</DialogTitle>
        <DialogDescription>
          Creates your organisation&apos;s own copy of {master.name} v{master.version} as a draft. You can customise the
          copy freely. The BCMS master is never changed.
        </DialogDescription>
      </DialogHeader>
      {existing.length ? (
        <p className="rounded-lg bg-info-soft px-3 py-2 text-xs text-info-soft-foreground">
          Your organisation already has {existing.length === 1 ? "a copy" : `${existing.length} copies`} of this template:{" "}
          {existing.map((e) => e.name).join(", ")}.
        </p>
      ) : null}
      <label className="text-xs font-bold text-navy">
        Name of your copy
        <Input className="mt-1" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="text-xs font-bold text-navy">
        Linked role (optional)
        <Input
          className="mt-1"
          list="use-template-roles"
          value={role}
          placeholder="e.g. Sales Executive"
          onChange={(e) => setRole(e.target.value)}
        />
        <datalist id="use-template-roles">
          {roles.map((r) => (
            <option key={r} value={r} />
          ))}
        </datalist>
      </label>
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" disabled={!name.trim()} onClick={() => onConfirm({ name, linkedRole: role.trim() || null })}>
          Create organisation copy
        </Button>
      </DialogFooter>
    </>
  );
}
