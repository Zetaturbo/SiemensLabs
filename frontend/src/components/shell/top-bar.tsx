"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useState } from "react";
import { Bell, ChevronRight, CircleHelp, PanelLeft, Search } from "lucide-react";
import { Avatar, IconButton, Kbd, Menu, MenuLabel, MenuSeparator, Tooltip, cn } from "@/design-system/react";
import { useOnlinePeople } from "@/lib/session/people";
import { caseIdFor, caseLabel, sectionFor } from "./nav";
import { useModKey, useShellDialogs, useSidebarCollapsed, toggleSidebar } from "./shell-state";
import { ThemeToggle } from "./theme-toggle";

/** 48 px bar at the top of the content column: breadcrumb, search, presence, notifications, help, theme. */
export function TopBar() {
  const collapsed = useSidebarCollapsed();
  const openPalette = useShellDialogs((s) => s.setPalette);
  const openShortcuts = useShellDialogs((s) => s.setShortcuts);
  const mod = useModKey();
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-subtle bg-canvas pl-2 pr-3">
      <Tooltip label={`${collapsed ? "Expand" : "Collapse"} sidebar · [`} side="bottom">
        <IconButton aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!collapsed} size="sm" onClick={toggleSidebar}>
          <PanelLeft />
        </IconButton>
      </Tooltip>
      <span aria-hidden className="h-4 w-px bg-line" />
      <Suspense fallback={<Breadcrumb pathname={null} />}>
        <BreadcrumbWithPath />
      </Suspense>
      <div className="ml-auto flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => openPalette(true)}
          aria-label="Search cases, suppliers, parts"
          aria-keyshortcuts="Meta+K Control+K"
          className="flex h-8 w-72 items-center gap-2 rounded-lg border border-line bg-surface pl-2.5 pr-1.5 text-left text-sm text-placeholder outline-none transition-colors hover:border-strong focus-visible:ring-2 focus-visible:ring-[var(--lw-focus-ring)] max-lg:w-44"
        >
          <Search aria-hidden className="size-4 shrink-0 text-tertiary" />
          <span className="min-w-0 flex-1 truncate">Search cases, suppliers, parts</span>
          <Kbd className="rounded border border-subtle bg-sunken">{mod === "⌘" ? "⌘K" : "Ctrl K"}</Kbd>
        </button>
        <OnlinePeople />
        <Notifications />
        <Tooltip label="Help and shortcuts" side="bottom">
          <IconButton aria-label="Help and keyboard shortcuts" size="sm" onClick={() => openShortcuts(true)}>
            <CircleHelp />
          </IconButton>
        </Tooltip>
        <ThemeToggle />
      </div>
    </header>
  );
}

function BreadcrumbWithPath() {
  return <Breadcrumb pathname={usePathname()} />;
}

function Breadcrumb({ pathname }: { pathname: string | null }) {
  const section = sectionFor(pathname);
  const caseId = caseIdFor(pathname);
  if (!section) return <span className="text-base font-medium text-subtext">Not found</span>;
  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 text-base">
      {caseId ? (
        <>
          <Link href={section.href} className="rounded-md px-1 text-subtext outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-[var(--lw-focus-ring)]">
            {section.label}
          </Link>
          <ChevronRight aria-hidden className="size-3.5 shrink-0 text-tertiary" />
          <span aria-current="page" className="truncate px-1 font-medium text-ink">
            {caseLabel(caseId)}
          </span>
        </>
      ) : (
        <span aria-current="page" className="px-1 font-medium text-ink">
          {section.label}
        </span>
      )}
    </nav>
  );
}

/** Online teammates, stacked; hover names the person and the case they have open. */
function OnlinePeople() {
  const people = useOnlinePeople();
  if (!people.length) return null;
  const shown = people.slice(0, 4);
  return (
    <div className="ml-1 mr-0.5 flex items-center" aria-label={`${people.length} online`} role="group">
      {shown.map((p, i) => (
        <Tooltip key={p.id} side="bottom" label={`${p.name} · ${caseLabel(p.caseId)}`}>
          <Link
            href={`/cases/${p.caseId}`}
            aria-label={`${p.name}, in ${caseLabel(p.caseId)}`}
            className={cn("relative inline-flex rounded-full outline-none ring-2 ring-canvas focus-visible:ring-[var(--lw-focus-ring)]", i > 0 && "-ml-1")}
          >
            <Avatar name={p.name} size="sm" className="rounded-full text-2xs" />
          </Link>
        </Tooltip>
      ))}
      {people.length > shown.length && (
        <span className="-ml-1 flex size-6 items-center justify-center rounded-full bg-sunken font-mono text-2xs text-subtext ring-2 ring-canvas">
          +{people.length - shown.length}
        </span>
      )}
    </div>
  );
}

const NOTIFICATIONS = [
  { id: "n1", title: "Research finished", body: "Knorr-Bremse AG: report ready in the brake system case", href: "/research", when: "12 min ago" },
  { id: "n2", title: "Award needs review", body: "Pantograph case awarded; decision memo awaiting sign-off", href: "/cases/case_pantograph", when: "1 h ago" },
];

function Notifications() {
  const [unread, setUnread] = useState(true);
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const trigger = (
    <span className="relative inline-flex">
      <IconButton aria-label={unread ? "Notifications, 2 unread" : "Notifications"} size="sm">
        <Bell />
      </IconButton>
      {unread && <span aria-hidden className="pointer-events-none absolute right-1 top-1 size-2 rounded-full bg-danger ring-2 ring-canvas" />}
    </span>
  );
  return (
    <Menu
      trigger={trigger}
      align="end"
      minWidth={340}
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setUnread(false);
      }}
    >
      <MenuLabel>Notifications</MenuLabel>
      {NOTIFICATIONS.map((n) => (
        <Link
          key={n.id}
          href={n.href}
          role="menuitem"
          onClick={close}
          className="flex flex-col gap-0.5 rounded-xl px-2.5 py-2 outline-none hover:bg-hover focus-visible:bg-hover"
        >
          <span className="flex items-baseline justify-between gap-3">
            <span className="text-base font-medium text-ink">{n.title}</span>
            <span className="shrink-0 text-xs text-tertiary">{n.when}</span>
          </span>
          <span className="text-sm text-subtext">{n.body}</span>
        </Link>
      ))}
      <MenuSeparator />
      <Link href="/settings?tab=notifications" role="menuitem" onClick={close} className="block rounded-xl px-2.5 py-2 text-sm text-subtext outline-none hover:bg-hover hover:text-ink focus-visible:bg-hover">
        Notification settings
      </Link>
    </Menu>
  );
}
