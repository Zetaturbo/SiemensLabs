"use client";
import { useEffect, useState } from "react";
import { useTrainUi } from "./store";

const HINT_MS = 6000;

/** First-run hint at the bottom centre; fades after the first interaction or six seconds. */
export function Hint() {
  const interacted = useTrainUi((s) => s.interacted);
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setExpired(true), HINT_MS);
    return () => clearTimeout(t);
  }, []);
  const hidden = interacted || expired;

  return (
    <p
      data-testid="train-hint"
      aria-hidden={hidden}
      className="pointer-events-none rounded-full px-3 py-1 text-xs whitespace-nowrap text-subtext transition-opacity duration-[var(--lw-duration-enter)] ease-out motion-reduce:transition-none"
      style={{ opacity: hidden ? 0 : 1, background: "var(--lw-glass)", backdropFilter: "blur(var(--lw-glass-blur))" }}
    >
      Click a part <Sep /> Drag to orbit <Sep /> Scroll to zoom <Sep /> Esc to deselect
    </p>
  );
}

function Sep() {
  return <span className="mx-1 text-tertiary">·</span>;
}
