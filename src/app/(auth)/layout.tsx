import type { ReactNode } from "react";

/**
 * AuthShell — centred card chrome for authentication screens (HTML 05–13).
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-bg-slate text-navy">
      <div className="flex flex-1 items-center justify-center p-6">
        {children}
      </div>
    </div>
  );
}
