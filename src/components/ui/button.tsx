import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.99] cursor-pointer select-none",
  {
    variants: {
      variant: {
        primary:
          "bg-violet-800 text-white shadow-sm hover:bg-violet-900 dark:bg-violet-700 dark:hover:bg-violet-600",
        secondary:
          "bg-sky-100 text-sky-950 border border-sky-200 hover:bg-sky-200/80 dark:bg-sky-950/60 dark:text-sky-200 dark:border-sky-800",
        outline:
          "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800",
        ghost:
          "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800",
        success:
          "bg-emerald-600 text-white shadow-sm hover:bg-emerald-700",
        warning:
          "bg-orange-600 text-white shadow-sm hover:bg-orange-700",
        danger:
          "bg-red-600 text-white shadow-sm hover:bg-red-700",
      },
      size: {
        sm: "h-9 px-3 text-xs rounded-lg",
        md: "h-10 px-4 py-2",
        lg: "h-12 px-5 text-base",
        /** Format terrain : cible tactile large (52 px) utilisable au bord du terrain */
        field: "min-h-13 px-5 py-3 text-base font-bold rounded-2xl",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  ),
);
Button.displayName = "Button";

export { buttonVariants };
