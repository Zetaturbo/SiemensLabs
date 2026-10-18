import type { ReactNode } from "react";
import { cn } from "@/design-system/react/utils/cn";

/** A Link styled as the design system's secondary button, size sm (buttonVariants is client-only). */
export const LINK_BUTTON =
  "inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-sm font-medium text-ink shadow-xs outline-none transition-colors hover:border-strong hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-[var(--lw-focus-ring)] [&_svg]:size-4";

/** Content column for list and settings pages inside the frame. */
export function PageBody({ children, className, width = "default" }: { children: ReactNode; className?: string; width?: "default" | "narrow" }) {
  return <div className={cn("mx-auto w-full px-8 pb-16 pt-8", width === "narrow" ? "max-w-3xl" : "max-w-6xl", className)}>{children}</div>;
}

/** Page title, one line of context, optional actions on the right. */
export function PageHeader({ title, context, actions }: { title: string; context: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-[-0.015em] text-ink">{title}</h1>
        <p className="mt-1 text-base text-subtext">{context}</p>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/** Quiet empty state inside a card or section. */
export function EmptyState({ title, body, action }: { title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1.5 px-6 py-12 text-center">
      <div className="text-base font-medium text-ink">{title}</div>
      {body ? <div className="max-w-sm text-sm text-subtext">{body}</div> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
