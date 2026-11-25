"use client";

import { CopyIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { CODE_HOURS, type Setup } from "../services/accounts";

/** The link carries the code after "#", which browsers do not send to servers. */
export function activationLink(setup: Setup) {
  return `${window.location.origin}/invite#email=${encodeURIComponent(setup.email)}&code=${setup.code ?? ""}`;
}

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copied`);
  } catch {
    toast.error("Could not copy. Select the text and copy it yourself.");
  }
}

/** Shown once, straight after an account or a new code is created. */
export function SetupDetails({ setup }: { setup: Setup }) {
  if (setup.method === "sso" || !setup.code) {
    return (
      <p className="text-sm text-slate-600">
        {setup.name} signs in with their work Microsoft account ({setup.email}). There is no code or BICMAS password.
      </p>
    );
  }
  const code = setup.code;
  return (
    <div className="space-y-3 text-sm text-slate-600">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border-slate bg-slate-50 p-4">
        <span data-testid="activation-code" className="font-mono text-lg font-bold tracking-wider break-all text-navy">
          {code}
        </span>
        <Button type="button" variant="secondary" size="sm" onClick={() => void copy(code, "Code")}>
          <CopyIcon aria-hidden /> Copy code
        </Button>
        {setup.method === "link" ? (
          <Button type="button" variant="secondary" size="sm" onClick={() => void copy(activationLink(setup), "Link")}>
            <CopyIcon aria-hidden /> Copy link
          </Button>
        ) : null}
      </div>
      <p>
        <strong className="text-navy">This is shown once.</strong> It works once, for {CODE_HOURS} hours, and only with {setup.email}.
      </p>
      {setup.method === "code" ? (
        <p>
          Give it to {setup.name} in person, by phone or on Teams. Do not email it. They open BICMAS, choose <strong>Activate account</strong>,
          and also confirm a code sent to their mailbox.
        </p>
      ) : (
        <p>{setup.name} can open the link, or choose Activate account and type the code. They also confirm a code sent to their mailbox.</p>
      )}
      <p className="text-xs text-slate-400">Sample data: no email is sent.</p>
    </div>
  );
}
