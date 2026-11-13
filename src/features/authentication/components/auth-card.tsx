import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type AuthCardProps = {
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  contentClassName?: string;
  /** Wider card for invite / multi-column layouts */
  size?: "md" | "lg" | "xl";
};

const sizeClass = {
  md: "max-w-md",
  lg: "max-w-2xl",
  xl: "max-w-2xl",
} as const;

/**
 * Centred auth surface matching HTML screens 05–13 (white card, slate border, soft navy shadow).
 */
export function AuthCard({
  children,
  footer,
  className,
  contentClassName,
  size = "xl",
}: AuthCardProps) {
  return (
    <div
      data-slot="auth-card"
      className={cn(
        "w-full overflow-hidden rounded-2xl border border-border-slate bg-white shadow-xl shadow-navy/5",
        sizeClass[size],
        className,
      )}
    >
      <div className={cn("p-8 lg:p-10", contentClassName)}>{children}</div>
      {footer ? (
        <div className="border-t border-border-slate bg-slate-50 p-6 text-center">
          {footer}
        </div>
      ) : null}
    </div>
  );
}
