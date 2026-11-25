"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import type { Setup } from "../services/accounts";
import { SetupDetails } from "./setup-details";

export function SetupDialog({ setup, onClose }: { setup: Setup | null; onClose: () => void }) {
  return (
    <Dialog open={setup !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{setup?.method === "sso" ? "Account ready" : "Activation code"}</DialogTitle>
          <DialogDescription>{setup ? `For ${setup.name}` : ""}</DialogDescription>
        </DialogHeader>
        {setup ? <SetupDetails setup={setup} /> : null}
        <DialogFooter>
          <Button type="button" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
