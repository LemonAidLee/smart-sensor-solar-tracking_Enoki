import { cn } from "@/lib/utils"
import { HTMLAttributes, ReactNode, forwardRef } from "react"

interface SectionWrapperProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode
  className?: string
  innerClassName?: string
  id?: string
}

export const SectionWrapper = forwardRef<HTMLElement, SectionWrapperProps>(
  ({ children, className, innerClassName, id, ...props }, ref) => {
    return (
      <section
        ref={ref}
        id={id}
        className={cn(
          "relative w-full py-24 md:py-32 lg:py-40 overflow-hidden",
          className
        )}
        {...props}
      >
        <div
          className={cn(
            "mx-auto w-full max-w-7xl px-4 md:px-8",
            innerClassName
          )}
        >
          {children}
        </div>
      </section>
    )
  }
)

SectionWrapper.displayName = "SectionWrapper"
