import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * BCMS status / chip badges — uppercase micro labels with soft fills.
 */
const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 rounded-md border border-transparent px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide whitespace-nowrap transition-colors [&_svg]:size-3",
  {
    variants: {
      variant: {
        default: "bg-navy text-white",
        secondary: "bg-slate-100 text-slate-500",
        outline: "border-border-slate bg-white text-navy",
        success: "bg-success-soft text-success-soft-foreground",
        warning: "bg-warning-soft text-warning-soft-foreground",
        error: "bg-error-soft text-error-soft-foreground",
        info: "bg-info-soft text-info-soft-foreground",
        accent: "bg-green-lime/20 text-navy",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props,
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  });
}

export { Badge, badgeVariants };
