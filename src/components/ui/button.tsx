import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * BCMS button variants from DESIGN_SYSTEM.md §6.
 * Primary = navy; secondary = white outline; accent = lime; ghost icon; danger soft.
 */
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent text-sm font-bold whitespace-nowrap transition-all outline-none select-none focus-visible:ring-2 focus-visible:ring-navy focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-navy text-white shadow-button hover:bg-navy/95",
        secondary:
          "border-border-slate bg-white text-navy shadow-sm hover:bg-slate-50",
        outline:
          "border-border-slate bg-white text-navy shadow-sm hover:bg-slate-50",
        accent:
          "bg-green-lime text-navy shadow-sm hover:bg-green-lime/90",
        ghost:
          "text-slate-400 hover:bg-slate-100 hover:text-navy",
        destructive:
          "bg-error-soft text-error-soft-foreground hover:bg-red-100",
        link: "text-green-deep underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 gap-2 px-5 py-2.5",
        sm: "h-8 gap-1.5 px-3 text-xs",
        lg: "h-11 gap-2 px-6",
        icon: "size-9 rounded-md",
        "icon-sm": "size-8 rounded-md",
        "icon-lg": "size-10 rounded-md",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
