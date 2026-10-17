import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"
import { LoaderCircle } from "lucide-react"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap text-black transition-all active:scale-[0.98] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:text-black disabled:opacity-100 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-blue-700 text-white hover:bg-blue-800 hover:text-white",
        destructive:
          "bg-destructive text-black hover:bg-destructive/90 hover:text-black focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40",
        outline:
          "border bg-background text-black shadow-xs hover:bg-accent hover:text-black dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-black hover:bg-secondary/80 hover:text-black",
        ghost: "text-black hover:bg-accent hover:text-black dark:hover:bg-accent/50",
        link: "text-black underline-offset-4 hover:text-black hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  onClick,
  disabled,
  children,
  type,
  ["aria-busy"]: ariaBusy,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const [pending, setPending] = React.useState(false)
  const handleClick: React.MouseEventHandler<HTMLButtonElement> = (event) => {
    const result: unknown = onClick?.(event)
    if (type === "submit" || !result || typeof (result as PromiseLike<unknown>).then !== "function") return
    setPending(true)
    void Promise.resolve(result).then(
      () => setPending(false),
      () => setPending(false),
    )
  }

  // Slot (asChild) requires exactly one React element child. A trailing
  // `{null}` / `{false}` still makes `children` an array and throws:
  // "Slot failed to slot onto its children".
  if (asChild) {
    return (
      <Slot.Root
        data-slot="button"
        data-variant={variant}
        data-size={size}
        onClick={onClick}
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      >
        {children}
      </Slot.Root>
    )
  }

  return (
    <button
      data-slot="button"
      data-variant={variant}
      data-size={size}
      disabled={disabled || pending}
      type={type}
      aria-busy={pending || ariaBusy}
      onClick={handleClick}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    >
      {children}
      {pending ? (
        <>
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          <span className="sr-only" role="status">
            In progress
          </span>
        </>
      ) : null}
    </button>
  )
}

export { Button, buttonVariants }
