import { LayersIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type AuthBrandHeaderProps = {
  className?: string;
  title?: string;
  subtitle?: string;
};

/**
 * Navy branded header used on the Login screen.
 */
export function AuthBrandHeader({
  className,
  title = "BICMAS",
  subtitle = "Capability Management System",
}: AuthBrandHeaderProps) {
  return (
    <div className={cn("bg-navy p-8 text-center", className)}>
      <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-xl bg-green-lime">
        <LayersIcon className="size-5 text-navy" aria-hidden />
      </div>
      <h1 className="text-2xl font-bold tracking-tight text-white">{title}</h1>
      <p className="mt-1 text-sm font-medium tracking-widest text-white/80 uppercase">
        {subtitle}
      </p>
    </div>
  );
}
