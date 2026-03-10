import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-md hover:bg-primary/90 hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0",
        destructive: "bg-destructive text-destructive-foreground shadow-md hover:bg-destructive/90 hover:shadow-lg",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground hover:border-accent/50",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent/50 hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        gradient: "bg-gradient-to-r from-primary via-primary to-accent text-primary-foreground shadow-lg hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 relative overflow-hidden before:absolute before:inset-0 before:bg-gradient-to-r before:from-transparent before:via-white/20 before:to-transparent before:translate-x-[-100%] hover:before:translate-x-[100%] before:transition-transform before:duration-500",
        premium: "bg-gradient-to-r from-primary to-accent text-white shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 hover:-translate-y-0.5 active:translate-y-0 font-semibold",
      },
      size: {
        default: "h-8 md:h-10 px-3 md:px-4 py-1.5 md:py-2 text-xs md:text-sm",
        sm: "h-7 md:h-9 rounded-lg px-2.5 md:px-3 text-xs md:text-sm",
        lg: "h-10 md:h-12 rounded-xl px-6 md:px-8 text-sm md:text-base",
        xl: "h-11 md:h-14 rounded-xl px-8 md:px-10 text-sm md:text-lg",
        icon: "h-8 w-8 md:h-10 md:w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
