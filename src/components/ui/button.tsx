import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold ring-offset-background transition-all duration-300 hover:scale-105 disabled:hover:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:scale-[0.98]",
  {
    variants: {
      variant: {
        default: "bg-[#0B1437] text-white hover:bg-[#111f54] font-semibold rounded-full",
        destructive:
          "border border-rose-200 bg-rose-50/70 text-rose-700 hover:bg-rose-100 hover:text-rose-900 hover:border-rose-300 font-semibold rounded-full transition-all duration-200",
        outline:
          "border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-[#0B1437] dark:text-white hover:bg-[#0B1437] hover:text-white font-semibold rounded-full transition-all duration-300",
        secondary: "bg-[#0B1437] text-white hover:bg-[#111f54] font-semibold rounded-full",
        navy: "bg-[#0B1437] text-white hover:bg-[#111f54] font-semibold rounded-full",
        ghost: "hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold rounded-full",
        link: "text-[#0B1437] underline-offset-4 hover:underline font-semibold",
      },
      size: {
        default: "h-10 px-5 py-2.5",
        sm: "h-8 rounded-full px-3 text-xs",
        lg: "h-11 rounded-full px-8 text-base",
        icon: "h-10 w-10 rounded-full",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

/**
 * Automatically intercepts and maps any accidental or legacy green/teal
 * utility classes to the canonical Dark Navy (#0B1437) palette.
 */
function sanitizeButtonClasses(className?: string): string {
  if (!className) return "";
  return className
    .replace(/\bbg-emerald-[0-9]{3}\b/g, "bg-[#0B1437]")
    .replace(/\bhover:bg-emerald-[0-9]{3}\b/g, "hover:bg-[#111f54]")
    .replace(/\bbg-teal-[0-9]{3}\b/g, "bg-[#0B1437]")
    .replace(/\bhover:bg-teal-[0-9]{3}\b/g, "hover:bg-[#111f54]")
    .replace(/\bbg-green-[0-9]{3}\b/g, "bg-[#0B1437]")
    .replace(/\bhover:bg-green-[0-9]{3}\b/g, "hover:bg-[#111f54]");
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    const sanitizedClassName = sanitizeButtonClasses(className);
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className: sanitizedClassName }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
