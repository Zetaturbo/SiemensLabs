"use client";
import Link from "next/link";
import { useState } from "react";
import { UserPlus } from "lucide-react";
import { Avatar, Badge, Button, Card, Field, Input, Modal, Select, StatusDot, TBody, THead, Table, Td, Th, Tr, useToast } from "@/design-system/react";
import { currentUser } from "@/lib/session/current-user";
import { useOnlinePeople, usePeople } from "@/lib/session/people";
import { caseLabel, partLabel } from "../nav";

/** The procurement team: roster (or case owners), role, department, cases owned, presence. */
export function TeamRoster() {
  const people = usePeople();
  const online = useOnlinePeople();
  const [inviting, setInviting] = useState(false);
  const sorted = [...people].sort((a, b) => (a.id === currentUser.id ? -1 : b.id === currentUser.id ? 1 : b.casesOwned.length - a.casesOwned.length));

  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm text-subtext">
          <span className="font-mono tabular-nums">{people.length}</span> members · <span className="font-mono tabular-nums">{online.length}</span> online
        </div>
        <Button variant="primary" size="sm" leading={<UserPlus />} onClick={() => setInviting(true)}>
          Invite
        </Button>
      </div>
      <Card className="overflow-hidden">
        <Table>
          <THead>
            <tr>
              <Th className="pl-4">Name</Th>
              <Th>Role</Th>
              <Th>Department</Th>
              <Th>Cases owned</Th>
              <Th className="pr-4">Status</Th>
            </tr>
          </THead>
          <TBody>
            {sorted.map((p) => {
              const here = online.find((o) => o.id === p.id);
              const you = p.id === currentUser.id;
              return (
                <Tr key={p.id}>
                  <Td className="pl-4">
                    <span className="flex items-center gap-2.5">
                      <Avatar name={you ? currentUser.name : p.name} size="sm" className="rounded-full" />
                      <span className="font-medium">{you ? currentUser.name : p.name}</span>
                      {you && (
                        <Badge size="sm" tone="neutral">
                          You
                        </Badge>
                      )}
                    </span>
                  </Td>
                  <Td className="text-subtext">{you ? currentUser.role : p.role}</Td>
                  <Td className="text-subtext">{you ? currentUser.department : p.department}</Td>
                  <Td>
                    {p.casesOwned.length ? (
                      <span className="flex items-center gap-2">
                        <span className="w-4 font-mono text-sm tabular-nums text-ink">{p.casesOwned.length}</span>
                        <span className="truncate text-sm text-subtext">
                          {p.casesOwned.slice(0, 2).map((c, i) => (
                            <span key={c.id}>
                              {i > 0 && ", "}
                              <Link href={`/cases/${c.id}`} className="hover:text-ink hover:underline">
                                {partLabel(c.partId)}
                              </Link>
                            </span>
                          ))}
                          {p.casesOwned.length > 2 && ` +${p.casesOwned.length - 2}`}
                        </span>
                      </span>
                    ) : (
                      <span className="text-sm text-tertiary">None</span>
                    )}
                  </Td>
                  <Td className="pr-4">
                    {here ? (
                      <StatusDot size="sm" tone="success" label={`In ${caseLabel(here.caseId)}`} />
                    ) : (
                      <StatusDot size="sm" tone={you ? "success" : "neutral"} label={you ? "Online" : "Away"} />
                    )}
                  </Td>
                </Tr>
              );
            })}
          </TBody>
        </Table>
      </Card>
      <InviteDialog open={inviting} onClose={() => setInviting(false)} />
    </>
  );
}

const ROLES = [
  { value: "buyer", label: "Buyer" },
  { value: "senior_buyer", label: "Senior buyer" },
  { value: "category_manager", label: "Category manager" },
  { value: "risk_analyst", label: "Risk analyst" },
  { value: "viewer", label: "Viewer" },
];

function InviteDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("buyer");
  const valid = /.+@.+\..+/.test(email);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Invite to workspace"
      description="They join Siemens Mobility · Procurement and can open every case."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!valid}
            onClick={() => {
              toast({ tone: "success", title: "Invitation sent", description: email });
              setEmail("");
              onClose();
            }}
          >
            Send invite
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="Email" htmlFor="inv-email">
          <Input id="inv-email" type="email" placeholder="name@company.com" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        </Field>
        <Field label="Role">
          <Select aria-label="Role" options={ROLES} value={role} onValueChange={setRole} />
        </Field>
      </div>
    </Modal>
  );
}
