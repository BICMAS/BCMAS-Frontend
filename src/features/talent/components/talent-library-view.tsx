"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";

import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { Field } from "@/components/shared/field";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createLibraryItem,
  libraryTypes,
  listLibraryItems,
  type LibraryItem,
  type LibraryType,
} from "@/features/talent/services/mock-library";
import { useHydratedUser } from "@/features/talent/use-hydrated-user";

const selectClass =
  "h-11 w-full rounded-lg border border-border-slate bg-slate-50 px-4 text-sm text-navy outline-none focus-visible:ring-2 focus-visible:ring-navy";

export function TalentLibraryView() {
  const user = useHydratedUser();
  const [rows, setRows] = useState<LibraryItem[]>(() => listLibraryItems());
  const [title, setTitle] = useState("");
  const [type, setType] = useState<LibraryType>("Knowledge tests");
  const [skillTag, setSkillTag] = useState("");
  const [roles, setRoles] = useState("");
  const [duration, setDuration] = useState("30");
  const [saving, setSaving] = useState(false);

  const columns = useMemo<DataTableColumn<LibraryItem>[]>(
    () => [
      {
        id: "title",
        header: "Item",
        cell: (row) => <span className="font-bold text-navy">{row.title}</span>,
      },
      {
        id: "type",
        header: "Type",
        cell: (row) => <Badge variant="info">{row.type}</Badge>,
      },
      { id: "skill", header: "Role-skill tag", accessorKey: "skillTag" },
      {
        id: "roles",
        header: "Reused on",
        cell: (row) => row.reusableRoles.join(", "),
      },
      {
        id: "duration",
        header: "Duration",
        cell: (row) => `${row.durationMinutes} min`,
      },
    ],
    [],
  );

  if (!user) return null;
  if (user.portal !== "hr_ld_admin") {
    return <p className="text-sm text-slate-500">The assessment library is for HR / L&D.</p>;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        title="Assessment Library"
        description="Reusable knowledge tests, scenarios, cases, role-play, exercises, and behavioural assessments. Each item carries a role-skill tag and can be used on more than one role."
      />
      <DataTable columns={columns} data={rows} getRowId={(row) => row.id} />
      <form
        className="space-y-5 rounded-2xl border border-border-slate bg-white p-6 shadow-sm"
        onSubmit={(event) => {
          event.preventDefault();
          if (title.trim().length < 2 || skillTag.trim().length < 2) return;
          setSaving(true);
          void createLibraryItem({
            title,
            type,
            skillTag,
            reusableRoles: roles.split(","),
            durationMinutes: Number(duration),
          })
            .then(() => {
              setRows(listLibraryItems());
              setTitle("");
              setSkillTag("");
              setRoles("");
              toast.success("Library item added");
            })
            .finally(() => setSaving(false));
        }}
      >
        <h2 className="font-bold text-navy">Add a reusable item</h2>
        <Field label="Title" htmlFor="library-title">
          <Input id="library-title" value={title} onChange={(event) => setTitle(event.target.value)} />
        </Field>
        <Field label="Type" htmlFor="library-type">
          <select
            id="library-type"
            className={selectClass}
            value={type}
            onChange={(event) => setType(event.target.value as LibraryType)}
          >
            {libraryTypes.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Role-skill tag" htmlFor="library-skill">
          <Input id="library-skill" value={skillTag} onChange={(event) => setSkillTag(event.target.value)} />
        </Field>
        <Field label="Roles" htmlFor="library-roles" hint="Separate role titles with commas. The item stays reusable.">
          <Input id="library-roles" value={roles} onChange={(event) => setRoles(event.target.value)} />
        </Field>
        <Field label="Duration" htmlFor="library-duration">
          <select id="library-duration" className={selectClass} value={duration} onChange={(event) => setDuration(event.target.value)}>
            <option value="20">20 minutes</option>
            <option value="30">30 minutes</option>
            <option value="40">40 minutes</option>
            <option value="60">60 minutes</option>
          </select>
        </Field>
        <Button type="submit" disabled={saving || title.trim().length < 2 || skillTag.trim().length < 2}>
          {saving ? "Saving…" : "Add to library"}
        </Button>
      </form>
    </div>
  );
}
