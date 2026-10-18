"use client";
import { useRouter } from "next/navigation";
import { Bell, ChevronsUpDown, Keyboard, LogOut, Monitor, Moon, Settings, Sun, User } from "lucide-react";
import { Avatar, Menu, MenuItem, MenuLabel, MenuSeparator, useToast } from "@/design-system/react";
import { currentUser } from "@/lib/session/current-user";
import { setThemeSetting, useShellDialogs, useThemeSetting, type ThemeSetting } from "./shell-state";

const THEMES: Array<{ value: ThemeSetting; label: string; icon: React.ReactNode }> = [
  { value: "light", label: "Light", icon: <Sun /> },
  { value: "dark", label: "Dark", icon: <Moon /> },
  { value: "system", label: "System", icon: <Monitor /> },
];

/** The signed-in user, bottom-left; opens the account menu upwards. */
export function AccountMenu({ collapsed }: { collapsed: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const theme = useThemeSetting();
  const openShortcuts = useShellDialogs((s) => s.setShortcuts);

  const trigger = (
    <button
      type="button"
      aria-label={`Account: ${currentUser.name}`}
      className="flex h-12 w-full items-center gap-2.5 rounded-lg px-1 text-left outline-none transition-colors hover:bg-hover focus-visible:ring-2 focus-visible:ring-[var(--lw-focus-ring)]"
    >
      <Avatar name={currentUser.name} size="md" />
      <span className="sb-label min-w-0 flex-1">
        <span className="block truncate text-base font-medium text-ink">{currentUser.name}</span>
        <span className="block truncate text-sm text-subtext">{currentUser.role}</span>
      </span>
      <ChevronsUpDown aria-hidden className="sb-label size-4 shrink-0 text-tertiary" />
    </button>
  );

  return (
    <Menu trigger={trigger} side="top" minWidth={288} className="w-full" contentClassName={collapsed ? "ml-1" : undefined}>
      <div className="flex items-center gap-2.5 px-2.5 pb-2 pt-1.5">
        <Avatar name={currentUser.name} size="md" />
        <div className="min-w-0">
          <div className="truncate text-base font-medium text-ink">{currentUser.name}</div>
          <div className="truncate text-sm text-subtext">{currentUser.email}</div>
        </div>
      </div>
      <MenuSeparator />
      <MenuItem icon={<User />} onSelect={() => router.push("/settings?tab=profile")}>
        Profile
      </MenuItem>
      <MenuItem icon={<Settings />} onSelect={() => router.push("/settings")}>
        Account settings
      </MenuItem>
      <MenuItem icon={<Bell />} onSelect={() => router.push("/settings?tab=notifications")}>
        Notifications
      </MenuItem>
      <MenuItem icon={<Keyboard />} shortcut="?" onSelect={() => openShortcuts(true)}>
        Keyboard shortcuts
      </MenuItem>
      <MenuSeparator />
      <MenuLabel>Theme</MenuLabel>
      {THEMES.map((t) => (
        <MenuItem key={t.value} icon={t.icon} checked={theme === t.value} keepOpen onSelect={() => setThemeSetting(t.value)}>
          {t.label}
        </MenuItem>
      ))}
      <MenuSeparator />
      <MenuItem icon={<LogOut />} onSelect={() => toast({ title: "Sign-in is managed by your company", description: "Single sign-on is not connected in this workspace." })}>
        Sign out
      </MenuItem>
    </Menu>
  );
}
