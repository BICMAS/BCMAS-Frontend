import { CpuIcon, LayersIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type BrandLogoProps = {
  label?: string;
  subtitle?: string;
  variant?: "tenant" | "platform" | "compact";
  className?: string;
};

export function BrandLogo({
  label = "BICMAS",
  subtitle = "BCMS",
  variant = "tenant",
  className,
}: BrandLogoProps) {
  if (variant === "compact") {
    return (
      <div className={cn("flex items-center gap-1.5", className)}>
        <div className="flex size-6 items-center justify-center rounded bg-navy">
          <LayersIcon className="size-2.5 text-green-lime" aria-hidden />
        </div>
        <span className="text-xs font-bold tracking-tight text-navy uppercase">
          BCMS
        </span>
      </div>
    );
  }

  if (variant === "platform") {
    return (
      <div className={cn("flex items-center gap-3", className)}>
        <div className="flex size-8 items-center justify-center rounded bg-green-lime">
          <CpuIcon className="size-4 text-navy" aria-hidden />
        </div>
        <div className="flex flex-col">
          <span className="text-sm leading-none font-bold tracking-tight text-white uppercase">
            {label}
          </span>
          <span className="mt-0.5 text-[9px] font-medium tracking-[0.2em] text-white/40 uppercase">
            {subtitle}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className="flex size-8 items-center justify-center rounded bg-navy">
        <LayersIcon className="size-3.5 text-green-lime" aria-hidden />
      </div>
      <div className="flex flex-col">
        <span className="text-sm leading-none font-bold tracking-tight text-navy">
          {label}
        </span>
        <span className="mt-0.5 text-[10px] font-medium tracking-widest text-slate-400 uppercase">
          {subtitle}
        </span>
      </div>
    </div>
  );
}
