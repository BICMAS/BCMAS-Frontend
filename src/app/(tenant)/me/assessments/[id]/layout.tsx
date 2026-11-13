import type { ReactNode } from "react";

/**
 * FocusedFlowShell placeholder for employee assessment wizard steps.
 */
export default function AssessmentFlowLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <div className="flex min-h-full flex-1 flex-col bg-bg-slate">{children}</div>;
}
