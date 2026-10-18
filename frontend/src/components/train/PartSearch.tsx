"use client";
import { Search } from "lucide-react";
import { useId, useMemo, useRef, useState } from "react";
import { cn, Input, Kbd } from "@/design-system/react";
import { GROUP_LABEL } from "./config";
import { stageText, type PartView } from "./encoding";
import { STAGE_CSS } from "./palette";
import { usePartViews, useTrainUi } from "./store";

const MAX_RESULTS = 6;

let searchInput: HTMLInputElement | null = null;
/** "/" focuses the part search (wired in TrainScreen). */
export function focusPartSearch() {
  searchInput?.focus();
  searchInput?.select();
}

function rank(view: PartView, q: string): number {
  const label = view.part.label.toLowerCase();
  const group = (GROUP_LABEL[view.part.group] ?? view.part.group).toLowerCase();
  if (label.startsWith(q)) return 0;
  if (label.split(/\s+/).some((w) => w.startsWith(q))) return 1;
  if (label.includes(q)) return 2;
  if (group.includes(q)) return 3;
  return -1;
}

/** Search field top-left: matches part names and groups; arrows and Enter select like a click on the dot. */
export function PartSearch() {
  const views = usePartViews();
  const select = useTrainUi((s) => s.select);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const listId = useId();
  const ref = useRef<HTMLInputElement | null>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return views
      .map((v) => ({ v, r: rank(v, q) }))
      .filter((x) => x.r >= 0)
      .sort((a, b) => a.r - b.r || a.v.part.label.localeCompare(b.v.part.label))
      .slice(0, MAX_RESULTS)
      .map((x) => x.v);
  }, [views, query]);
  const shown = open && results.length > 0;
  const current = Math.min(active, Math.max(0, results.length - 1));

  const choose = (v: PartView) => {
    select(v.part.id, { fly: true });
    setQuery("");
    setOpen(false);
    ref.current?.blur();
  };

  return (
    <div className="relative w-60">
      <Input
        ref={(el) => {
          ref.current = el;
          searchInput = el;
        }}
        inputSize="sm"
        leading={<Search />}
        trailing={query ? undefined : <Kbd className="border border-line">/</Kbd>}
        placeholder="Find a part"
        aria-label="Find a part"
        role="combobox"
        aria-expanded={shown}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={shown ? `${listId}-${current}` : undefined}
        aria-keyshortcuts="/"
        value={query}
        className="bg-[var(--lw-glass-strong)] shadow-sm backdrop-blur-[var(--lw-glass-blur)]"
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            if (!results.length) return;
            e.preventDefault();
            const d = e.key === "ArrowDown" ? 1 : -1;
            setActive((current + d + results.length) % results.length);
          } else if (e.key === "Enter") {
            if (!results[current]) return;
            e.preventDefault();
            choose(results[current]);
          } else if (e.key === "Escape") {
            e.preventDefault();
            if (query) setQuery("");
            else e.currentTarget.blur();
          }
        }}
      />
      {shown && (
        <ul id={listId} role="listbox" aria-label="Parts" className="absolute top-full right-0 left-0 mt-1 overflow-hidden rounded-lg border border-line bg-surface py-1 shadow-md">
          {results.map((v, i) => (
            <li
              key={v.part.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === current}
              className={cn("flex cursor-pointer items-center gap-2 px-2.5 py-1.5 text-sm", i === current && "bg-hover")}
              onMouseEnter={() => setActive(i)}
              // mousedown, not click: the input's blur would close the list first
              onMouseDown={(e) => {
                e.preventDefault();
                choose(v);
              }}
            >
              <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: STAGE_CSS[v.stage] }} />
              <span className="min-w-0 flex-1 truncate text-ink">{v.part.label}</span>
              <span className="shrink-0 text-2xs text-tertiary">{stageText(v)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
