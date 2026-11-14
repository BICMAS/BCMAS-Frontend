import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import {
  getTalentAssessment,
  type TalentAssessmentType,
} from "@/features/talent/services/mock-talent";

const readinessVariant = {
  Ready: "success",
  "Near Ready": "warning",
  "Not Ready": "error",
} as const;

export function TalentRecordView({
  assessmentId,
  type,
}: {
  assessmentId: string;
  type: TalentAssessmentType;
}) {
  const record = getTalentAssessment(assessmentId, type);
  if (!record) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-500">This assessment is not on the current talent list.</p>
        <Link href="/talent" className="text-sm font-bold text-navy">
          Back to Talent Assessment
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <p className="text-[11px] font-bold tracking-[0.1em] text-slate-400 uppercase">
        {type === "recruitment" ? "Recruitment" : "Promotion"}
      </p>
      <h1 className="text-3xl font-bold text-navy">{record.name}</h1>
      <p className="text-sm text-slate-500">{record.targetRole}</p>
      <div className="flex flex-wrap gap-2">
        <Badge variant={readinessVariant[record.readiness]}>{record.readiness}</Badge>
        <Badge variant="success">{record.status}</Badge>
      </div>
      <p className="text-sm text-navy">Result {record.result}%</p>
      <Link href="/talent" className="inline-block text-sm font-bold text-navy">
        Back to overview
      </Link>
    </div>
  );
}
