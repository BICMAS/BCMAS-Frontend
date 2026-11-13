"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type ConfirmDialogProps = {
  triggerLabel: string;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "destructive";
  onConfirm?: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

/**
 * Confirmation dialog built on Dialog — destructive / assumed-access style confirms.
 */
export function ConfirmDialog({
  triggerLabel,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "default",
  onConfirm,
  open,
  onOpenChange,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        render={
          <Button variant={tone === "destructive" ? "destructive" : "secondary"} />
        }
      >
        {triggerLabel}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="-mx-6 -mb-6 border-border-slate">
          <DialogClose render={<Button variant="secondary" />}>
            {cancelLabel}
          </DialogClose>
          <DialogClose
            render={
              <Button
                variant={tone === "destructive" ? "destructive" : "default"}
              />
            }
            onClick={onConfirm}
          >
            {confirmLabel}
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
