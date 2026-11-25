"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Field } from "@/components/shared/field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SetupDetails } from "@/features/accounts/components/setup-details";
import {
  accountById,
  cancelActivationCode,
  correctEmail,
  newActivationCode,
  platformCanHelp,
  resetSignIn,
  setupMethodFor,
  type Setup,
} from "@/features/accounts/services/accounts";
import { useAccountsRevision } from "@/features/accounts/use-accounts";
import { auditFirstAdmin, type TenantRecord } from "@/features/platform/services/mock-platform";
import { useSessionStore } from "@/stores/session-store";

/** The Platform Super Admin's help for a tenant's first admin. Later accounts belong to the tenant. */
export function FirstAdminDialog({ tenant, onClose }: { tenant: TenantRecord; onClose: () => void }) {
  useAccountsRevision();
  const actor = useSessionStore((s) => s.user);
  const account = tenant.adminUserId ? accountById(tenant.adminUserId) : null;
  const [setup, setSetup] = useState<Setup | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<Setup | void>, summary: string) {
    setBusy(true);
    try {
      const result = await action();
      setSetup(result ?? null);
      setEmail(null);
      setConfirmReset(false);
      auditFirstAdmin(tenant.id, actor.name, summary);
      toast.success("Done");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  if (!account) return null;
  const id = account.id;
  const hasCodes = setupMethodFor(account.organisationId) !== "sso";
  const canHelp = platformCanHelp(id);
  const waiting = ["Invited", "Code expired", "Reset pending"].includes(account.status);
  const working = account.status === "Active" || account.status === "Locked";

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>First admin of {tenant.name}</DialogTitle>
          <DialogDescription>
            {account.name} ({account.email})
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Badge variant={working ? "success" : "info"}>{account.status}</Badge>
          {setup ? <SetupDetails setup={setup} /> : null}
          {!canHelp ? (
            <p className="text-sm text-slate-500">This tenant has another working Organisation Admin, who manages its accounts.</p>
          ) : null}
          {canHelp && email !== null ? (
            <Field label="Correct email" htmlFor="first-admin-email">
              <Input id="first-admin-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
          ) : null}
          {confirmReset ? (
            <p className="text-sm text-slate-600">
              Check who they are first, using a number from the contract. Their password and MFA stop working until they activate again.
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onClose}>
            Close
          </Button>
          {canHelp && waiting && hasCodes && email === null ? (
            <>
              {account.codeExpiresAt ? (
                <Button type="button" variant="secondary" disabled={busy} onClick={() => void run(() => cancelActivationCode(id, actor), `Cancelled the activation code for ${account.name}`)}>
                  Cancel code
                </Button>
              ) : null}
              <Button type="button" disabled={busy} onClick={() => void run(() => newActivationCode(id, actor), `Created a new activation code for ${account.name}`)}>
                New code
              </Button>
            </>
          ) : null}
          {canHelp && waiting && account.status !== "Reset pending" ? (
            email === null ? (
              <Button type="button" variant="secondary" onClick={() => setEmail(account.email)}>
                Correct email
              </Button>
            ) : (
              <Button
                type="button"
                disabled={busy || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())}
                onClick={() => void run(() => correctEmail(id, email, actor), `Corrected the email for ${account.name}`)}
              >
                Save email
              </Button>
            )
          ) : null}
          {canHelp && working && hasCodes ? (
            confirmReset ? (
              <Button type="button" variant="destructive" disabled={busy} onClick={() => void run(() => resetSignIn(id, actor), `Reset sign-in for ${account.name}`)}>
                Confirm reset
              </Button>
            ) : (
              <Button type="button" variant="secondary" onClick={() => setConfirmReset(true)}>
                Reset sign-in
              </Button>
            )
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
