"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { ChevronsUpDown, Plus } from "lucide-react";
import { Menu, MenuItem, MenuLabel, MenuSeparator, StatusDot, Tooltip, cn, useToast } from "@/design-system/react";
import { currentWorkspace, WORKSPACES } from "@/lib/session/current-user";
import { useRecentCases } from "@/lib/session/people";
import { AccountMenu } from "./account-menu";
import { SECTIONS, SETTINGS, STAGE_LABEL, STAGE_TONE, partLabel, sectionFor, type Section } from "./nav";
import { useSidebarCollapsed } from "./shell-state";

/**
 * Left rail: workspace switcher, sections, recent cases, settings and the signed-in user.
 * 240 px wide, 56 px collapsed (icons only). The width comes from html[data-sidebar] (see globals.css),
 * so the first paint already has the stored state. Icons keep their x position in both states.
 */
export function Sidebar() {
  const collapsed = useSidebarCollapsed();
  return (
    <aside aria-label="Sidebar" className="app-sidebar flex h-full shrink-0 flex-col border-r border-subtle bg-sidebar">
      <WorkspaceSwitcher />
      <Suspense fallback={<SidebarNav pathname={null} collapsed={collapsed} />}>
        <SidebarNavWithPath collapsed={collapsed} />
      </Suspense>
      <div className="flex flex-col px-2 pb-2 pt-1">
        <AccountMenu collapsed={collapsed} />
      </div>
    </aside>
  );
}

function SidebarNavWithPath({ collapsed }: { collapsed: boolean }) {
  return <SidebarNav pathname={usePathname()} collapsed={collapsed} />;
}

function SidebarNav({ pathname, collapsed }: { pathname: string | null; collapsed: boolean }) {
  const active = sectionFor(pathname);
  return (
    <>
      <nav aria-label="Sections" className="flex flex-col gap-0.5 px-2 pt-2">
        {SECTIONS.map((s) => (
          <NavLink key={s.href} section={s} active={active?.href === s.href} collapsed={collapsed} />
        ))}
      </nav>
      {!collapsed && <RecentCases pathname={pathname} />}
      <nav aria-label="Settings" className="mt-auto flex flex-col gap-0.5 px-2 pt-2">
        <NavLink section={SETTINGS} active={active?.href === SETTINGS.href} collapsed={collapsed} />
      </nav>
    </>
  );
}

const ITEM =
  "group/si flex h-8 w-full items-center gap-2.5 rounded-lg px-[11px] text-base outline-none transition-colors duration-[var(--lw-duration-fast)] focus-visible:ring-2 focus-visible:ring-[var(--lw-focus-ring)]";

function NavLink({ section, active, collapsed }: { section: Section; active: boolean; collapsed: boolean }) {
  const Icon = section.icon;
  const link = (
    <Link
      href={section.href}
      aria-current={active ? "page" : undefined}
      aria-label={collapsed ? section.label : undefined}
      className={cn(ITEM, active ? "bg-active font-medium text-ink" : "text-subtext hover:bg-hover hover:text-ink")}
    >
      <Icon aria-hidden className={cn("size-[18px] shrink-0", active ? "text-ink" : "text-tertiary group-hover/si:text-subtext")} />
      <span className="sb-label min-w-0 flex-1 truncate">{section.label}</span>
    </Link>
  );
  return collapsed ? <SideTip label={section.label}>{link}</SideTip> : link;
}

/** Tooltip to the right of a collapsed rail item. */
export function SideTip({ label, children }: { label: ReactNode; children: React.ReactElement }) {
  return (
    <Tooltip label={label} side="right" className="z-[70]">
      <span className="flex w-full">{children}</span>
    </Tooltip>
  );
}

function RecentCases({ pathname }: { pathname: string | null }) {
  const recent = useRecentCases(3);
  if (!recent.length) return null;
  return (
    <div className="sb-label mt-5 px-2">
      <div className="px-[11px] pb-1 text-2xs font-semibold uppercase tracking-wide text-tertiary">Recent</div>
      <div className="flex flex-col gap-0.5">
        {recent.map((c) => {
          const href = `/cases/${c.id}`;
          const active = pathname === href;
          return (
            <Link
              key={c.id}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(ITEM, "h-7 text-sm", active ? "bg-active font-medium text-ink" : "text-subtext hover:bg-hover hover:text-ink")}
            >
              <span className="flex size-[18px] shrink-0 items-center justify-center" title={STAGE_LABEL[c.stage]}>
                <StatusDot size="sm" tone={STAGE_TONE[c.stage]} aria-label={STAGE_LABEL[c.stage]} />
              </span>
              <span className="min-w-0 flex-1 truncate">{partLabel(c.partId)}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function WorkspaceSwitcher() {
  const { toast } = useToast();
  const [org, unit] = currentWorkspace.name.split(" · ");
  const mark = (
    <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary text-xs font-semibold text-primary-fg">
      SM
    </span>
  );
  const trigger = (
    <button
      type="button"
      aria-label={`Workspace: ${currentWorkspace.name}`}
      className="flex h-10 w-full items-center gap-2.5 rounded-lg px-1.5 text-left outline-none transition-colors hover:bg-hover focus-visible:ring-2 focus-visible:ring-[var(--lw-focus-ring)]"
    >
      {mark}
      <span className="sb-label min-w-0 flex-1 leading-tight">
        <span className="block truncate text-base font-semibold text-ink">{org}</span>
        <span className="block truncate text-xs text-subtext">{unit}</span>
      </span>
      <ChevronsUpDown aria-hidden className="sb-label size-4 shrink-0 text-tertiary" />
    </button>
  );
  return (
    <div className="flex h-12 shrink-0 items-center border-b border-subtle px-2">
      <Menu trigger={trigger} minWidth={260} className="w-full">
        <MenuLabel>Workspaces</MenuLabel>
        {WORKSPACES.map((w) => (
          <MenuItem
            key={w.id}
            checked={w.id === currentWorkspace.id}
            onSelect={() => w.id !== currentWorkspace.id && toast({ title: "Workspace switching is not enabled", description: w.name })}
            icon={
              <span className="flex size-[18px] items-center justify-center rounded-md bg-sunken text-2xs font-semibold text-subtext">
                {w.name.split(" · ")[1]?.[0] ?? "W"}
              </span>
            }
          >
            {w.name}
          </MenuItem>
        ))}
        <MenuSeparator />
        <MenuItem icon={<Plus />} onSelect={() => toast({ title: "Contact your administrator to add a workspace" })}>
          New workspace
        </MenuItem>
      </Menu>
    </div>
  );
}
