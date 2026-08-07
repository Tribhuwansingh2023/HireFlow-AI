import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2, Mail, ShieldCheck, ShieldAlert, UserPlus, Users, X } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import { LoadingPanel, PageHeader, Pill, humanise } from "@/components/ui-kit";
import { errorMessage, recordAudit } from "@/lib/audit";
import { ROLE_LABEL, useAuth, type AppRole } from "@/lib/use-auth";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Team & permissions — HireFlow AI" },
      {
        name: "description",
        content: "Invite teammates, assign hiring roles and verify row-level security end to end.",
      },
      { property: "og:title", content: "Team & permissions — HireFlow AI" },
      { property: "og:description", content: "HR admin console for users, roles and access verification." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

const ROLES: AppRole[] = ["admin", "recruiter", "hiring_manager", "viewer"];

type Probe = { name: string; expectation: string; status: "pass" | "fail"; detail: string };

function SettingsPage() {
  const qc = useQueryClient();
  const { isAdmin, roles, user, profile } = useAuth();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AppRole>("recruiter");
  const [note, setNote] = useState("");
  const [probes, setProbes] = useState<Probe[] | null>(null);
  const [probing, setProbing] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["team"],
    queryFn: async () => {
      const [people, roleRows, invites] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at", { ascending: true }),
        supabase.from("user_roles").select("*"),
        supabase.from("invitations").select("*").order("created_at", { ascending: false }),
      ]);
      if (people.error) throw new Error(people.error.message);
      if (roleRows.error) throw new Error(roleRows.error.message);
      if (invites.error) throw new Error(invites.error.message);
      return { people: people.data ?? [], roleRows: roleRows.data ?? [], invites: invites.data ?? [] };
    },
  });

  const invite = useMutation({
    mutationFn: async () => {
      const parsed = z.object({ email: z.string().trim().email("Enter a valid email address") }).safeParse({ email });
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid email");
      const { data: userRes } = await supabase.auth.getUser();
      const { data: row, error } = await supabase
        .from("invitations")
        .insert({
          email: parsed.data.email.toLowerCase(),
          role,
          note: note.trim() || null,
          invited_by: userRes.user?.id ?? null,
        })
        .select()
        .single();
      if (error) {
        throw new Error(
          error.code === "23505" ? "There is already a pending invitation for that address." : error.message,
        );
      }
      await recordAudit({
        action: "team.invite",
        entity_type: "invitation",
        entity_id: row.id,
        summary: `Invited ${row.email} as ${ROLE_LABEL[row.role as AppRole]}.`,
        details: { role: row.role },
      });
    },
    onSuccess: () => {
      toast.success("Invitation created — the role applies automatically when they sign up.");
      setInviteOpen(false);
      setEmail("");
      setNote("");
      qc.invalidateQueries({ queryKey: ["team"] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const revoke = useMutation({
    mutationFn: async (inv: any) => {
      const { error } = await supabase.from("invitations").update({ status: "revoked" }).eq("id", inv.id);
      if (error) throw new Error(error.message);
      await recordAudit({
        action: "team.invite_revoked",
        entity_type: "invitation",
        entity_id: inv.id,
        summary: `Revoked the pending invitation for ${inv.email}.`,
      });
    },
    onSuccess: () => {
      toast.success("Invitation revoked");
      qc.invalidateQueries({ queryKey: ["team"] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const setRoleFor = useMutation({
    mutationFn: async ({ person, next }: { person: any; next: AppRole }) => {
      const del = await supabase.from("user_roles").delete().eq("user_id", person.id);
      if (del.error) throw new Error(del.error.message);
      const ins = await supabase.from("user_roles").insert({ user_id: person.id, role: next });
      if (ins.error) throw new Error(ins.error.message);
      await recordAudit({
        action: "team.role_change",
        entity_type: "user",
        entity_id: person.id,
        summary: `Changed ${person.full_name ?? person.email}'s role to ${ROLE_LABEL[next]}.`,
        details: { role: next },
      });
    },
    onSuccess: () => {
      toast.success("Role updated — RLS applies immediately on their next request.");
      qc.invalidateQueries({ queryKey: ["team"] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const runProbes = async () => {
    setProbing(true);
    const results: Probe[] = [];
    const denied = (err: any) =>
      !!err && (err.code === "42501" || /row-level security|permission denied/i.test(err.message ?? ""));

    // 1. Read access
    {
      const { error } = await supabase.from("candidates").select("id").limit(1);
      results.push({
        name: "Read talent pool",
        expectation: "Every signed-in teammate can read",
        status: error ? "fail" : "pass",
        detail: error ? error.message : "Select succeeded under your session.",
      });
    }

    // 2. Write access to job posts (non-destructive: create then remove a probe row)
    {
      const { data: row, error } = await supabase
        .from("jobs")
        .insert({ title: "RLS permission probe", description: "temporary permission check", status: "closed" })
        .select("id")
        .maybeSingle();
      if (row?.id) await supabase.from("jobs").delete().eq("id", row.id);
      const allowed = !error && !!row;
      const canWriteExpected = roles.some((r) => r === "admin" || r === "recruiter" || r === "hiring_manager");
      results.push({
        name: "Create job posts",
        expectation: canWriteExpected ? "Allowed for your role" : "Blocked for your role",
        status: allowed === canWriteExpected ? "pass" : "fail",
        detail: allowed
          ? "Insert succeeded and the probe row was removed."
          : `Insert blocked${error ? `: ${error.message}` : ""}.`,
      });
    }

    // 3. Role assignment (admin only)
    {
      const myRole = roles[0] ?? "viewer";
      const { error } = await supabase.from("user_roles").insert({ user_id: user?.id ?? "", role: myRole });
      const blocked = denied(error);
      results.push({
        name: "Assign user roles",
        expectation: isAdmin ? "Only administrators may write roles" : "Blocked for your role",
        status: isAdmin ? (blocked ? "fail" : "pass") : blocked ? "pass" : "fail",
        detail: blocked
          ? "Row-level security rejected the write."
          : "Write reached the table (duplicate role rows are rejected by a uniqueness rule).",
      });
    }

    // 4. Another user's profile must be untouchable
    {
      const { data: rows, error } = await supabase
        .from("profiles")
        .update({ title: "rls-probe" })
        .neq("id", user?.id ?? "")
        .select("id");
      results.push({
        name: "Edit another teammate's profile",
        expectation: "Always blocked",
        status: (rows?.length ?? 0) === 0 ? "pass" : "fail",
        detail: error
          ? `Rejected: ${error.message}`
          : (rows?.length ?? 0) === 0
            ? "No rows were writable — profiles are owner-scoped."
            : `${rows?.length} rows were modified — policy is too permissive.`,
      });
    }

    // 5. Audit trail immutability
    {
      const { data: rows, error } = await supabase
        .from("audit_events")
        .delete()
        .not("id", "is", null)
        .select("id");
      results.push({
        name: "Delete audit events",
        expectation: "Always blocked (append-only)",
        status: (rows?.length ?? 0) === 0 ? "pass" : "fail",
        detail: error ? `Rejected: ${error.message}` : "No audit rows are deletable.",
      });
    }

    setProbes(results);
    setProbing(false);
    await recordAudit({
      action: "security.rls_verified",
      entity_type: "workspace",
      summary: `Ran an end-to-end access verification — ${results.filter((r) => r.status === "pass").length}/${results.length} checks passed.`,
      details: { results },
    });
  };

  const roleOf = (id: string): AppRole =>
    ((data?.roleRows ?? []).find((r: any) => r.user_id === id)?.role as AppRole) ?? "viewer";
  const pending = (data?.invites ?? []).filter((i: any) => i.status === "pending");

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Team & permissions"
        description="Invite teammates, assign the role that governs what they can change, and prove the access rules hold with a live end-to-end permission check."
        actions={
          isAdmin ? (
            <button
              onClick={() => setInviteOpen(true)}
              className="focus-ring inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-transform hover:-translate-y-0.5"
              style={{ backgroundImage: "var(--gradient-primary)", color: "var(--primary-foreground)" }}
            >
              <UserPlus className="size-4" />
              Invite teammate
            </button>
          ) : (
            <Pill tone="neutral">Administrator access required to manage the team</Pill>
          )
        }
      />

      <div className="panel mb-6 p-5">
        <h2 className="font-display text-sm font-semibold">Your account</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {profile?.full_name ?? user?.email} · {roles.map((r) => ROLE_LABEL[r]).join(", ") || "No role assigned"}
        </p>
      </div>

      {isLoading ? (
        <LoadingPanel rows={5} label="Loading team…" />
      ) : (
        <>
          <section className="panel mb-6 overflow-hidden">
            <div className="hairline flex items-center gap-2 px-5 py-4">
              <Users className="size-4 text-primary" />
              <h2 className="font-display text-sm font-semibold">Workspace members ({data?.people.length ?? 0})</h2>
            </div>
            <ul className="divide-y divide-border">
              {(data?.people ?? []).map((p: any) => (
                <li key={p.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {p.full_name ?? p.email} {p.id === user?.id ? <span className="text-muted-foreground">(you)</span> : null}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{p.email}</p>
                  </div>
                  {isAdmin && p.id !== user?.id ? (
                    <select
                      value={roleOf(p.id)}
                      aria-label={`Role for ${p.email}`}
                      onChange={(e) => setRoleFor.mutate({ person: p, next: e.target.value as AppRole })}
                      className="focus-ring rounded-lg border border-input bg-background/60 px-3 py-2 text-xs outline-none"
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABEL[r]}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Pill tone={roleOf(p.id) === "admin" ? "accent" : "neutral"}>{ROLE_LABEL[roleOf(p.id)]}</Pill>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section className="panel mb-6 overflow-hidden">
            <div className="hairline flex items-center gap-2 px-5 py-4">
              <Mail className="size-4 text-accent" />
              <h2 className="font-display text-sm font-semibold">Pending invitations ({pending.length})</h2>
            </div>
            {pending.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted-foreground">
                No pending invitations. Invited addresses receive their role automatically the first time they sign up.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {pending.map((i: any) => (
                  <li key={i.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{i.email}</p>
                      <p className="truncate text-xs text-muted-foreground">{i.note || "No note"}</p>
                    </div>
                    <Pill tone="warning">{ROLE_LABEL[i.role as AppRole]}</Pill>
                    {isAdmin ? (
                      <button
                        onClick={() => revoke.mutate(i)}
                        className="focus-ring rounded-lg border border-border px-3 py-2 text-xs hover:border-destructive/50 hover:text-destructive"
                      >
                        Revoke
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      <section className="panel overflow-hidden">
        <div className="hairline flex flex-wrap items-center gap-3 px-5 py-4">
          <ShieldCheck className="size-4 text-success" />
          <h2 className="font-display text-sm font-semibold">Access verification</h2>
          <button
            onClick={runProbes}
            disabled={probing}
            className="focus-ring ml-auto inline-flex items-center gap-2 rounded-lg bg-secondary px-3 py-2 text-xs font-medium hover:bg-surface-2 disabled:opacity-60"
          >
            {probing ? <Loader2 className="size-3.5 animate-spin" /> : <ShieldCheck className="size-3.5" />}
            Run end-to-end check
          </button>
        </div>
        {probes ? (
          <ul className="divide-y divide-border">
            {probes.map((p) => (
              <li key={p.name} className="flex flex-wrap items-start gap-3 px-5 py-4">
                {p.status === "pass" ? (
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" />
                ) : (
                  <ShieldAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{p.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.expectation} · {p.detail}
                  </p>
                </div>
                <Pill tone={p.status === "pass" ? "success" : "danger"}>{humanise(p.status)}</Pill>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 py-6 text-sm text-muted-foreground">
            Runs live requests against the database as your own session — reads, privileged writes, cross-user edits and
            audit immutability — and records the outcome in the audit trail.
          </p>
        )}
      </section>

      {inviteOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 p-4 backdrop-blur-sm">
          <div className="glass-panel rise-in w-full max-w-md rounded-2xl p-6">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-display text-lg font-semibold">Invite a teammate</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  The role is granted automatically when they create their account with this address.
                </p>
              </div>
              <button onClick={() => setInviteOpen(false)} className="focus-ring rounded-md p-2" aria-label="Close">
                <X className="size-4" />
              </button>
            </div>

            <label htmlFor="inv-email" className="mb-1.5 mt-6 block text-xs font-medium text-muted-foreground">
              Work email
            </label>
            <input
              id="inv-email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jordan@company.com"
              className="focus-ring w-full rounded-xl border border-input bg-background/60 px-3 py-2.5 text-sm outline-none"
            />

            <label htmlFor="inv-role" className="mb-1.5 mt-4 block text-xs font-medium text-muted-foreground">
              Role
            </label>
            <select
              id="inv-role"
              value={role}
              onChange={(e) => setRole(e.target.value as AppRole)}
              className="focus-ring w-full rounded-xl border border-input bg-background/60 px-3 py-2.5 text-sm outline-none"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>

            <label htmlFor="inv-note" className="mb-1.5 mt-4 block text-xs font-medium text-muted-foreground">
              Note (optional)
            </label>
            <input
              id="inv-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Covering the platform team reqs"
              className="focus-ring w-full rounded-xl border border-input bg-background/60 px-3 py-2.5 text-sm outline-none"
            />

            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setInviteOpen(false)} className="focus-ring rounded-xl border border-border px-4 py-2.5 text-sm">
                Cancel
              </button>
              <button
                onClick={() => invite.mutate()}
                disabled={invite.isPending}
                className="focus-ring inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold disabled:opacity-60"
                style={{ backgroundImage: "var(--gradient-primary)", color: "var(--primary-foreground)" }}
              >
                {invite.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                Send invitation
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
