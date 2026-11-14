"use client";

import Link from "next/link";

import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { listOwnPromotions } from "@/features/talent/services/mock-promotion";
import { useHydratedUser } from "@/features/talent/use-hydrated-user";

export function OwnPromotionListView() {
  const user = useHydratedUser();
  if (!user) return null;
  const rows = listOwnPromotions(user.id);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="My Promotion" description="Only assignments created for you are listed here." />
      {rows.length ? (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row.id} className="rounded-2xl border border-border-slate bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-bold text-navy">{row.roleTitle}</p>
                  <p className="text-sm text-slate-500">From {row.currentRole}</p>
                </div>
                <Badge variant="info">{row.status}</Badge>
              </div>
              <Link
                href={
                  row.status === "Assigned" || row.status === "In progress"
                    ? `/me/promotion/${row.id}/start`
                    : `/me/promotion/${row.id}/results`
                }
                className="mt-3 inline-block text-sm font-bold text-navy"
              >
                {row.status === "Assigned" || row.status === "In progress" ? "Start assessment" : "View readiness"}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-500">You have no promotion assignment.</p>
      )}
    </div>
  );
}
