import {
  createContext,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronRight } from "lucide-react";
import { cn } from "../utils/cn";

/* ------------------------------------------------------------------ context */

type MenuCtx = { close: () => void };
const MenuContext = createContext<MenuCtx | null>(null);

/* ------------------------------------------------------------------ helpers */

/** Gap kept between the panel and the viewport edges, px. */
const VIEWPORT_PAD = 8;
const ITEM_SELECTOR = '[role="menuitem"]:not(:disabled)';
const FOCUSABLE =
  'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

const subscribeNoop = () => () => {};
/** False during SSR and hydration, true afterwards (the portal needs document.body). */
function useIsClient() {
  return useSyncExternalStore(subscribeNoop, () => true, () => false);
}

/** Enabled items of `menu`, without the items of nested submenus. */
function menuItems(menu: Element): HTMLElement[] {
  return Array.from(menu.querySelectorAll<HTMLElement>(ITEM_SELECTOR)).filter(
    (el) => el.closest('[role="menu"]') === menu,
  );
}

/** Ancestors of `el` that clip their overflow (scroll containers and the like). */
function clippingAncestors(el: Element): Element[] {
  const out: Element[] = [];
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const s = getComputedStyle(p);
    if (s.overflowX !== "visible" || s.overflowY !== "visible") out.push(p);
  }
  return out;
}

/** True when `r` lies completely outside the viewport or one of the clipping boxes. */
function isClippedOut(r: DOMRect, clippers: Element[], vw: number, vh: number) {
  const outside = (c: { top: number; right: number; bottom: number; left: number }) =>
    r.bottom <= c.top || r.top >= c.bottom || r.right <= c.left || r.left >= c.right;
  if (outside({ top: 0, left: 0, right: vw, bottom: vh })) return true;
  return clippers.some((c) => outside(c.getBoundingClientRect()));
}

/* --------------------------------------------------------------------- root */

export interface MenuProps {
  /** The clickable element that opens the menu. */
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: "start" | "end";
  side?: "bottom" | "top";
  sideOffset?: number;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  contentClassName?: string;
  /** min width of the panel in px. */
  minWidth?: number;
}

/**
 * Dropdown menu with soft elevation, optional search header, nested submenus
 * and checkmark selection — the project picker / plugin picker in the
 * reference. The panel renders in a portal on document.body with fixed
 * positioning from the trigger's rect, so scroll containers do not clip it.
 * It follows scroll and resize, flips to the other side when there is no
 * room, and closes once the trigger is scrolled out of view.
 *
 * Keyboard: Enter/Space or ArrowDown on the trigger opens it and focuses the
 * search field, the checked item or the first item; ArrowUp/ArrowDown/Home/End
 * move between items, ArrowRight/ArrowLeft enter and leave submenus, Escape
 * closes and returns focus to the trigger, Tab closes and continues from the
 * trigger.
 */
export function Menu({
  trigger,
  children,
  align = "start",
  side = "bottom",
  sideOffset = 6,
  open,
  defaultOpen,
  onOpenChange,
  className,
  contentClassName,
  minWidth = 240,
}: MenuProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [internal, setInternal] = useState(defaultOpen ?? false);
  const isOpen = open !== undefined ? open : internal;
  const isClient = useIsClient();

  const setOpen = (next: boolean) => {
    if (open === undefined) setInternal(next);
    onOpenChange?.(next);
  };

  const focusTrigger = () => {
    const t = triggerRef.current;
    const el = t?.querySelector<HTMLElement>(FOCUSABLE) ?? (t?.firstElementChild as HTMLElement | null);
    el?.focus({ preventScroll: true });
  };

  /** Close; focus goes back to the trigger when it was inside the panel. */
  const close = () => {
    if (contentRef.current?.contains(document.activeElement)) focusTrigger();
    setOpen(false);
  };
  // Latest `close` for the listeners that are registered once per opening.
  const closeRef = useRef(close);
  useLayoutEffect(() => {
    closeRef.current = close;
  });

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (!t || rootRef.current?.contains(t) || contentRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeRef.current();
      }
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [isOpen]);

  // Fixed position from the trigger rect, before paint; follows scroll (any ancestor) and resize.
  useLayoutEffect(() => {
    if (!isOpen || !isClient) return;
    const anchor = rootRef.current;
    const panel = contentRef.current;
    if (!anchor || !panel) return;
    const clippers = clippingAncestors(anchor);

    const place = () => {
      const r = anchor.getBoundingClientRect();
      const vw = document.documentElement.clientWidth;
      const vh = document.documentElement.clientHeight;
      if (isClippedOut(r, clippers, vw, vh)) {
        closeRef.current();
        return;
      }
      // Width as with the former in-flow panel: minWidth, or up to the trigger's width.
      const maxWidth = `${Math.min(Math.max(minWidth, r.width), vw - 2 * VIEWPORT_PAD)}px`;
      if (panel.style.maxWidth !== maxWidth) panel.style.maxWidth = maxWidth;
      const w = panel.offsetWidth;
      const h = panel.offsetHeight;
      const below = vh - r.bottom - sideOffset - VIEWPORT_PAD;
      const above = r.top - sideOffset - VIEWPORT_PAD;
      const s =
        side === "bottom"
          ? h > below && above > below
            ? "top"
            : "bottom"
          : h > above && below > above
            ? "bottom"
            : "top";
      const top = s === "bottom" ? r.bottom + sideOffset : r.top - sideOffset - h;
      const preferred = align === "start" ? r.left : r.right - w;
      const left = Math.max(VIEWPORT_PAD, Math.min(preferred, vw - w - VIEWPORT_PAD));
      panel.style.top = `${top}px`;
      panel.style.left = `${left}px`;
      panel.style.transformOrigin = `${align === "start" ? "left" : "right"} ${s === "bottom" ? "top" : "bottom"}`;
      panel.dataset.side = s;
      panel.style.visibility = "visible";
    };

    // Size changes (trigger or content) are applied on the next frame to keep
    // ResizeObserver free of same-frame loops.
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(place);
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    const ro = new ResizeObserver(schedule);
    ro.observe(anchor);
    ro.observe(panel);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
      ro.disconnect();
    };
  }, [isOpen, isClient, side, align, sideOffset, minWidth]);

  // On open, focus the search field, the checked item or the first item.
  useLayoutEffect(() => {
    if (!isOpen || !isClient) return;
    const panel = contentRef.current;
    if (!panel || panel.contains(document.activeElement)) return;
    const items = menuItems(panel);
    const target =
      panel.querySelector<HTMLElement>("input:not(:disabled)") ??
      items.find((el) => el.dataset.checked !== undefined) ??
      items[0];
    target?.focus({ preventScroll: true });
  }, [isOpen, isClient]);

  const onTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    if (!isOpen) setOpen(true);
    else if (contentRef.current) menuItems(contentRef.current)[0]?.focus({ preventScroll: true });
  };

  const onPanelKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Tab") {
      // Leave as if the panel sat right after the trigger: focus the trigger and
      // let the browser's default Tab move on from there.
      focusTrigger();
      setOpen(false);
      return;
    }
    const active = document.activeElement as HTMLElement | null;
    const menu = active?.closest('[role="menu"]') ?? contentRef.current;
    if (!menu) return;
    if (active?.tagName === "INPUT" && (e.key === "Home" || e.key === "End")) return;
    const items = menuItems(menu);
    if (!items.length) return;
    const i = active ? items.indexOf(active) : -1;
    const last = items.length - 1;
    let next: HTMLElement | undefined;
    if (e.key === "ArrowDown") next = items[i < 0 || i === last ? 0 : i + 1];
    else if (e.key === "ArrowUp") next = items[i <= 0 ? last : i - 1];
    else if (e.key === "Home") next = items[0];
    else if (e.key === "End") next = items[last];
    else return;
    e.preventDefault();
    next?.focus();
  };

  return (
    <div ref={rootRef} className={cn("relative inline-flex", className)}>
      <span ref={triggerRef} onClick={() => setOpen(!isOpen)} onKeyDown={onTriggerKeyDown} className="contents">
        {trigger}
      </span>
      {isOpen && isClient
        ? createPortal(
            <MenuContext.Provider value={{ close }}>
              <div
                ref={contentRef}
                role="menu"
                style={{ minWidth }}
                onKeyDown={onPanelKeyDown}
                className={cn(
                  // top/left/visibility are set by the layout effect before paint
                  "invisible fixed left-0 top-0 z-[110] w-max rounded-2xl border border-subtle bg-surface p-1.5 shadow-pop",
                  "animate-[lw-menu-in_120ms_var(--lw-ease-out)]",
                  contentClassName,
                )}
                data-side={side}
                data-align={align}
              >
                {children}
              </div>
            </MenuContext.Provider>,
            document.body,
          )
        : null}
    </div>
  );
}

/* --------------------------------------------------------------------- item */

export interface MenuItemProps {
  children: React.ReactNode;
  icon?: React.ReactNode;
  /** Right-aligned hint (shortcut / meta). */
  shortcut?: React.ReactNode;
  /** Arbitrary trailing node (overrides checkmark/shortcut layout if set). */
  trailing?: React.ReactNode;
  checked?: boolean;
  destructive?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
  /** Provide nested items to turn this into a submenu parent. */
  submenu?: React.ReactNode;
  /** Keep the menu open after selecting. */
  keepOpen?: boolean;
}

export function MenuItem({
  children,
  icon,
  shortcut,
  trailing,
  checked,
  destructive,
  disabled,
  onSelect,
  submenu,
  keepOpen,
}: MenuItemProps) {
  const ctx = useContext(MenuContext);
  const [subOpen, setSubOpen] = useState(false);
  const subId = useId();
  const rowRef = useRef<HTMLButtonElement | null>(null);
  const subRef = useRef<HTMLDivElement | null>(null);
  const focusSubOnOpen = useRef(false);

  // Keyboard-opened submenu: move focus to its first item once rendered.
  useEffect(() => {
    if (!subOpen || !focusSubOnOpen.current) return;
    focusSubOnOpen.current = false;
    if (subRef.current) menuItems(subRef.current)[0]?.focus({ preventScroll: true });
  }, [subOpen]);

  const row = (
    <button
      ref={rowRef}
      type="button"
      role="menuitem"
      disabled={disabled}
      data-checked={checked ? "" : undefined}
      aria-haspopup={submenu ? "menu" : undefined}
      aria-expanded={submenu ? subOpen : undefined}
      onClick={() => {
        if (disabled) return;
        if (submenu) {
          setSubOpen((s) => !s);
          return;
        }
        onSelect?.();
        if (!keepOpen) ctx?.close();
      }}
      className={cn(
        "group/mi flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-base",
        "outline-none transition-colors duration-[var(--lw-duration-fast)]",
        "focus-visible:bg-hover",
        destructive ? "text-danger hover:bg-danger-soft" : "text-ink hover:bg-hover",
        disabled && "pointer-events-none opacity-45",
      )}
    >
      {icon ? (
        <span
          className={cn(
            "flex size-[18px] shrink-0 items-center justify-center [&_svg]:size-[18px]",
            destructive ? "text-danger" : "text-subtext",
          )}
        >
          {icon}
        </span>
      ) : null}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {trailing ??
        (submenu ? (
          <ChevronRight className="size-4 shrink-0 text-tertiary" />
        ) : checked ? (
          <Check className="size-4 shrink-0 text-ink" />
        ) : shortcut ? (
          <span className="shrink-0 text-xs text-tertiary">{shortcut}</span>
        ) : null)}
    </button>
  );

  if (!submenu) return row;

  return (
    <div
      className="relative"
      onMouseEnter={() => setSubOpen(true)}
      onMouseLeave={() => setSubOpen(false)}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight" && e.target === rowRef.current && !disabled) {
          e.preventDefault();
          e.stopPropagation();
          if (subOpen && subRef.current) menuItems(subRef.current)[0]?.focus({ preventScroll: true });
          else {
            focusSubOnOpen.current = true;
            setSubOpen(true);
          }
        } else if (e.key === "ArrowLeft" && subRef.current?.contains(e.target as Node)) {
          e.preventDefault();
          e.stopPropagation();
          setSubOpen(false);
          rowRef.current?.focus({ preventScroll: true });
        }
      }}
    >
      {row}
      {subOpen ? (
        <div
          ref={subRef}
          id={subId}
          role="menu"
          className={cn(
            "absolute left-full top-0 z-50 ml-1 min-w-[220px] rounded-2xl border border-subtle bg-surface p-1.5 shadow-pop",
            "animate-[lw-menu-in_120ms_var(--lw-ease-out)]",
          )}
        >
          {submenu}
        </div>
      ) : null}
    </div>
  );
}

/* ----------------------------------------------------------- label / search */

export function MenuLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2.5 pb-1 pt-2 text-2xs font-semibold uppercase tracking-wide text-tertiary">
      {children}
    </div>
  );
}

export function MenuSeparator() {
  return <div role="separator" className="my-1.5 h-px bg-subtle" />;
}

export function MenuSearch(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className, placeholder = "Search", ...rest } = props;
  return (
    <div className="mb-1 flex items-center gap-2 px-2.5 py-1.5">
      <svg viewBox="0 0 24 24" className="size-4 shrink-0 text-tertiary" fill="none" stroke="currentColor" strokeWidth={2}>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" strokeLinecap="round" />
      </svg>
      <input
        className={cn("min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-placeholder", className)}
        placeholder={placeholder}
        {...rest}
      />
    </div>
  );
}
