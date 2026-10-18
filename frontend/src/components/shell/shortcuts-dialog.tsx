"use client";
import { Kbd, Modal } from "@/design-system/react";
import { useModKey, useShellDialogs } from "./shell-state";

/** Help: the keyboard shortcuts, global and on the train map. */
export function ShortcutsDialog() {
  const open = useShellDialogs((s) => s.shortcuts);
  const setOpen = useShellDialogs((s) => s.setShortcuts);
  const mod = useModKey();
  const groups: Array<{ title: string; rows: Array<[string[], string]> }> = [
    {
      title: "Everywhere",
      rows: [
        [[mod, "K"], "Search cases, suppliers, parts"],
        [["["], "Collapse or expand the sidebar"],
        [["?"], "Keyboard shortcuts"],
        [["Esc"], "Close a dialog or menu"],
      ],
    },
    {
      title: "Train map",
      rows: [
        [["/"], "Find a part"],
        [["R"], "Reset the view"],
        [["+", "−"], "Zoom"],
      ],
    },
  ];
  return (
    <Modal open={open} onClose={() => setOpen(false)} title="Keyboard shortcuts" size="sm">
      <div className="flex flex-col gap-4 pb-3">
        {groups.map((g) => (
          <section key={g.title}>
            <h3 className="pb-1.5 text-2xs font-semibold uppercase tracking-wide text-tertiary">{g.title}</h3>
            <dl className="flex flex-col">
              {g.rows.map(([keys, label]) => (
                <div key={label} className="flex h-8 items-center justify-between gap-4 border-b border-subtle last:border-b-0">
                  <dt className="text-base text-ink">{label}</dt>
                  <dd className="flex items-center gap-1">
                    {keys.map((k) => (
                      <Kbd key={k} className="min-w-6 rounded border border-line bg-sunken text-xs text-subtext">
                        {k}
                      </Kbd>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Modal>
  );
}
