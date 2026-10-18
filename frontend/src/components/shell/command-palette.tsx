"use client";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CornerDownLeft, FolderKanban, Search, TrainFront } from "lucide-react";
import { Kbd, StatusDot, cn } from "@/design-system/react";
import { useCases } from "@/lib/cases/store";
import { PARTS, SECTIONS, SETTINGS, STAGE_LABEL, STAGE_TONE } from "./nav";
import { useShellDialogs } from "./shell-state";

interface Entry {
  id: string;
  group: "Actions" | "Cases" | "Sections";
  label: string;
  hint?: string;
  href: string;
  icon: React.ReactNode;
  keywords: string;
}

/** ⌘K / Ctrl+K: jump to a case, a section or the train map. Arrow keys move, Enter opens, Escape closes. */
export function CommandPalette() {
  const open = useShellDialogs((s) => s.palette);
  if (!open || typeof document === "undefined") return null;
  return createPortal(<Palette />, document.body);
}

function Palette() {
  const setOpen = useShellDialogs((s) => s.setPalette);
  const router = useRouter();
  const cases = useCases((s) => s.cases);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    restoreFocus.current = document.activeElement as HTMLElement | null;
    inputRef.current?.focus();
    return () => restoreFocus.current?.focus?.({ preventScroll: true });
  }, []);

  const entries = useMemo<Entry[]>(() => {
    const byPart = new Map(Object.values(cases).map((c) => [c.partId, c]));
    const actions: Entry[] = [
      { id: "a-train", group: "Actions", label: "Open train map", href: "/train", icon: <TrainFront />, keywords: "train map parts home" },
    ];
    const caseEntries: Entry[] = PARTS.map((p) => {
      const c = byPart.get(p.id);
      const stage = c?.stage ?? "none";
      return {
        id: `c-${p.id}`,
        group: "Cases",
        label: p.label,
        hint: STAGE_LABEL[stage],
        href: `/cases/${c?.id ?? `case_${p.id}`}`,
        icon: (
          <span className="flex size-[18px] items-center justify-center">
            <StatusDot size="sm" tone={STAGE_TONE[stage]} />
          </span>
        ),
        keywords: `${p.id} ${p.profile} ${c?.owner?.name ?? ""} case part`,
      };
    });
    const sections: Entry[] = [...SECTIONS, SETTINGS].map((s) => {
      const Icon = s.icon;
      return { id: `s-${s.href}`, group: "Sections", label: s.label, href: s.href, icon: <Icon />, keywords: `${s.href} section` };
    });
    return [...actions, ...caseEntries, ...sections];
  }, [cases]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    const words = q.split(/\s+/);
    return entries.filter((e) => {
      const hay = `${e.label} ${e.keywords} ${e.hint ?? ""}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [entries, query]);

  const active = Math.min(index, Math.max(0, results.length - 1));

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const go = (e: Entry | undefined) => {
    if (!e) return;
    setOpen(false);
    router.push(e.href);
  };

  const onKeyDown = (ev: React.KeyboardEvent) => {
    if (ev.key === "ArrowDown") {
      ev.preventDefault();
      setIndex((active + 1) % Math.max(1, results.length));
    } else if (ev.key === "ArrowUp") {
      ev.preventDefault();
      setIndex((active - 1 + results.length) % Math.max(1, results.length));
    } else if (ev.key === "Enter") {
      ev.preventDefault();
      go(results[active]);
    } else if (ev.key === "Escape") {
      ev.preventDefault();
      setOpen(false);
    } else if (ev.key === "Tab") {
      ev.preventDefault();
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Search">
      <div className="absolute inset-0 bg-overlay animate-[lw-fade-in_120ms_var(--lw-ease-out)]" onClick={() => setOpen(false)} />
      <div className="relative flex max-h-[min(520px,70vh)] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-subtle bg-surface shadow-pop animate-[lw-scale-in_140ms_var(--lw-ease-out)]">
        <div className="flex h-12 shrink-0 items-center gap-2.5 border-b border-subtle px-4">
          <Search aria-hidden className="size-4 shrink-0 text-tertiary" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIndex(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Search cases, suppliers, parts"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={results[active] ? `${listId}-${results[active].id}` : undefined}
            className="min-w-0 flex-1 bg-transparent text-md text-ink outline-none placeholder:text-placeholder"
          />
          <Kbd className="rounded border border-subtle bg-sunken">Esc</Kbd>
        </div>
        <div ref={listRef} id={listId} role="listbox" aria-label="Results" className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5">
          {results.length === 0 && (
            <div className="px-3 py-8 text-center text-base text-subtext">
              No match. Supplier questions go to a case chat.
            </div>
          )}
          {results.map((e, i) => {
            const header = results[i - 1]?.group !== e.group ? e.group : null;
            return (
              <div key={e.id}>
                {header && <div className="px-2.5 pb-1 pt-2 text-2xs font-semibold uppercase tracking-wide text-tertiary">{header}</div>}
                <div
                  id={`${listId}-${e.id}`}
                  role="option"
                  aria-selected={i === active}
                  data-index={i}
                  onMouseMove={() => i !== active && setIndex(i)}
                  onClick={() => go(e)}
                  className={cn(
                    "flex h-9 cursor-pointer items-center gap-2.5 rounded-xl px-2.5 text-base text-ink",
                    i === active ? "bg-hover" : "",
                  )}
                >
                  <span className="flex size-[18px] shrink-0 items-center justify-center text-subtext [&_svg]:size-[18px]">{e.icon}</span>
                  <span className="min-w-0 flex-1 truncate">{e.label}</span>
                  {e.hint && <span className="shrink-0 text-sm text-tertiary">{e.hint}</span>}
                  {i === active && <CornerDownLeft aria-hidden className="size-3.5 shrink-0 text-tertiary" />}
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex h-9 shrink-0 items-center gap-3 border-t border-subtle px-4 text-xs text-tertiary">
          <span className="flex items-center gap-1">
            <Kbd className="rounded border border-subtle bg-sunken">↑</Kbd>
            <Kbd className="rounded border border-subtle bg-sunken">↓</Kbd> move
          </span>
          <span className="flex items-center gap-1">
            <Kbd className="rounded border border-subtle bg-sunken">↵</Kbd> open
          </span>
          <span className="ml-auto flex items-center gap-1.5">
            <FolderKanban aria-hidden className="size-3.5" /> {PARTS.length} cases
          </span>
        </div>
      </div>
    </div>
  );
}
