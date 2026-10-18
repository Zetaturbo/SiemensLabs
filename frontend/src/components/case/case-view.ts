"use client";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

/** How the buyer works the case: the conversation, or the classic board (candidates and shortlist side by side). */
export type CaseView = "chat" | "board";

const KEY = (caseId: string) => `sri.caseView.${caseId}`;

function readStored(caseId: string): CaseView | null {
  try {
    const v = window.localStorage.getItem(KEY(caseId));
    return v === "board" || v === "chat" ? v : null;
  } catch {
    return null;
  }
}

/** `?view=board` for the board; the chat (the default) carries no parameter. Other parameters are kept. */
function writeUrl(view: CaseView) {
  const url = new URL(window.location.href);
  if (view === "board") url.searchParams.set("view", "board");
  else url.searchParams.delete("view");
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

/**
 * The case's view, per case: the URL wins (`?view=board` opens the board, `?view=chat` the chat), else the
 * choice remembered in localStorage, else the chat. Switching writes both, so a reload or a copied link
 * opens the same view. Read on the client only (the case screen renders after the store is restored).
 */
export function useCaseView(caseId: string): [CaseView, (view: CaseView) => void] {
  const params = useSearchParams();
  const [view, setView] = useState<CaseView>(() => {
    const fromUrl = params.get("view");
    if (fromUrl === "board" || fromUrl === "chat") return fromUrl;
    return readStored(caseId) ?? "chat";
  });

  // A board remembered from an earlier visit shows in the address bar too, so the link the buyer copies opens it.
  useEffect(() => {
    if (view === "board" && params.get("view") !== "board") writeUrl("board");
    // once, for the view the screen opened with
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const change = useCallback(
    (next: CaseView) => {
      setView(next);
      try {
        window.localStorage.setItem(KEY(caseId), next);
      } catch {
        // storage unavailable: the URL still carries the view
      }
      writeUrl(next);
    },
    [caseId],
  );

  return [view, change];
}
