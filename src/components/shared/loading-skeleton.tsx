import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type LoadingSkeletonProps = {
  rows?: number;
  className?: string;
  variant?: "card" | "table" | "form";
};

/**
 * Composite loading skeletons for common BCMS layouts.
 */
export function LoadingSkeleton({
  rows = 3,
  className,
  variant = "card",
}: LoadingSkeletonProps) {
  if (variant === "table") {
    return (
      <div
        className={cn(
          "overflow-hidden rounded-xl border border-border-slate bg-white p-4 shadow-card",
          className,
        )}
      >
        <Skeleton className="mb-4 h-4 w-40" />
        <div className="space-y-3">
          {Array.from({ length: rows }).map((_, index) => (
            <Skeleton key={index} className="h-10 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (variant === "form") {
    return (
      <div className={cn("space-y-5", className)}>
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-11 w-full" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4",
        className,
      )}
    >
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className="rounded-xl border border-border-slate bg-white p-6 shadow-card"
        >
          <Skeleton className="mb-4 h-3 w-20" />
          <Skeleton className="h-8 w-24" />
        </div>
      ))}
    </div>
  );
}
