import type { ReactNode } from "react";

/**
 * FocusedFlowShell placeholder for employee promotion assessment steps.
 */
export default function PromotionFlowLayout({ children }: { children: ReactNode }) {
  return <div className="flex min-h-full flex-1 flex-col bg-bg-slate">{children}</div>;
}
