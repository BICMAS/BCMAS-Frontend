"use client";

import { useState } from "react";
import { Loader2Icon, PlusIcon, RotateCcwIcon } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  resetFramework,
  saveFramework,
} from "@/features/skills/services/mock-skills";
import type { FrameworkLevel } from "@/features/skills/types";

type FrameworkSettingsViewProps = {
  initialLevels: FrameworkLevel[];
};

export function FrameworkSettingsView({
  initialLevels,
}: FrameworkSettingsViewProps) {
  const [levels, setLevels] = useState(initialLevels);
  const [saving, setSaving] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);

  const updateLevel = (
    id: string,
    patch: Partial<Pick<FrameworkLevel, "label" | "description">>,
  ) => {
    setLevels((prev) =>
      prev.map((level) => (level.id === id ? { ...level, ...patch } : level)),
    );
  };

  const addLevel = () => {
    const rank = levels.length + 1;
    setLevels((prev) => [
      ...prev,
      {
        id: `fw-${Date.now()}`,
        rank,
        label: `Level ${rank}`,
        description: "",
      },
    ]);
  };

  const onSave = async () => {
    if (levels.some((l) => !l.label.trim() || !l.description.trim())) {
      toast.error("Every level needs a label and description");
      return;
    }
    setSaving(true);
    try {
      const next = await saveFramework(levels);
      setLevels(next);
      toast.success("Framework saved (mock)");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title="Framework Settings"
        description="Configure the organisation proficiency scale used across skills and role profiles."
        actions={
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setResetOpen(true)}
            >
              <RotateCcwIcon className="size-4" aria-hidden />
              Reset defaults
            </Button>
            <Button type="button" disabled={saving} onClick={() => void onSave()}>
              {saving ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : null}
              Save framework
            </Button>
          </>
        }
      />

      <div className="space-y-4">
        {levels.map((level) => (
          <div
            key={level.id}
            className="grid gap-4 rounded-xl border border-border-slate bg-white p-6 shadow-sm md:grid-cols-[80px_1fr_1.5fr]"
          >
            <div>
              <p className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">
                Rank
              </p>
              <p className="text-2xl font-bold text-navy">{level.rank}</p>
            </div>
            <div>
              <label className="mb-2 block text-xs font-bold tracking-wider text-slate-500 uppercase">
                Label
              </label>
              <Input
                value={level.label}
                onChange={(e) =>
                  updateLevel(level.id, { label: e.target.value })
                }
              />
            </div>
            <div>
              <label className="mb-2 block text-xs font-bold tracking-wider text-slate-500 uppercase">
                Description
              </label>
              <Textarea
                rows={2}
                value={level.description}
                onChange={(e) =>
                  updateLevel(level.id, { description: e.target.value })
                }
              />
            </div>
          </div>
        ))}
      </div>

      <Button type="button" variant="secondary" onClick={addLevel}>
        <PlusIcon className="size-4" aria-hidden />
        Add level
      </Button>

      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset proficiency scale?</DialogTitle>
            <DialogDescription>
              This restores the default five-level BCMS scale (mock).
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="-mx-6 -mb-6">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setResetOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={async () => {
                const next = await resetFramework();
                setLevels(next);
                setResetOpen(false);
                toast.success("Framework reset to defaults");
              }}
            >
              Reset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
