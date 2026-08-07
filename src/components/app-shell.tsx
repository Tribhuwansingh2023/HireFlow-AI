import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import {
  BarChart3,
  BrainCircuit,
  Briefcase,
  CalendarClock,
  FileSearch,
  FileText,
  Mail,

  Gavel,
  LayoutDashboard,
  LogOut,
  Menu,
  Sparkles,
  Scale,
  ScrollText,
  Settings,
  Video,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { ROLE_LABEL, useAuth } from "@/lib/use-auth";
import { cn } from "@/lib/utils";
import { Pill } from "./ui-kit";

const NAV = [
  { to: "/copilot", label: "RecruitGPT", icon: Sparkles },
  { to: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { to: "/jobs", label: "Job posts", icon: Briefcase },
  { to: "/candidates", label: "Talent pool", icon: Users },
  { to: "/twin", label: "Digital Twin", icon: BrainCircuit },
  { to: "/debate", label: "AI Debate", icon: Scale },
  { to: "/simulator", label: "Interview Simulator", icon: Video },
  { to: "/interviews", label: "Interviews", icon: CalendarClock },
  { to: "/offers", label: "Offers", icon: Gavel },
  { to: "/emails", label: "Emails", icon: Mail },
  { to: "/templates", label: "Templates", icon: FileText },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/audit", label: "Audit trail", icon: ScrollText },
  { to: "/settings", label: "Team & access", icon: Settings },
] as const;


export function AppShell({ children }: { children: ReactNode }) {
  const { profile, roles, user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);

  const signOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  const initials = (profile?.full_name ?? user?.email ?? "?")
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

  const nav = (
    <nav className="flex flex-1 flex-col gap-1 px-3" aria-label="Main">
      {NAV.map((item) => {
        const active = pathname === item.to || pathname.startsWith(`${item.to}/`);
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={() => setOpen(false)}
            className={cn(
              "focus-ring group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
            )}
          >
            <item.icon
              className={cn("size-4 shrink-0 transition-colors", active ? "text-primary" : "text-muted-foreground")}
            />
            <span className="truncate">{item.label}</span>
            {active ? <span className="ml-auto size-1.5 rounded-full bg-primary" /> : null}
          </Link>
        );
      })}
    </nav>
  );

  const brand = (
    <div className="flex items-center gap-3 px-5 py-5">
      <span
        className="grid size-9 place-items-center rounded-xl text-sm font-bold"
        style={{ backgroundImage: "var(--gradient-primary)", color: "var(--primary-foreground)" }}
      >
        HF
      </span>
      <div className="leading-tight">
        <p className="font-display text-sm font-semibold tracking-tight">HireFlow AI</p>
        <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Agentic ATS</p>
      </div>
    </div>
  );

  const footer = (
    <div className="border-t border-sidebar-border p-3">
      <div className="flex items-center gap-3 rounded-lg px-2 py-2">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-xs font-semibold">
          {initials || "?"}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{profile?.full_name ?? user?.email}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {roles.length ? roles.map((r) => ROLE_LABEL[r]).join(", ") : "No role assigned"}
          </p>
        </div>
        <button
          onClick={signOut}
          aria-label="Sign out"
          className="focus-ring rounded-md p-2 text-muted-foreground transition-colors hover:bg-destructive/12 hover:text-destructive"
        >
          <LogOut className="size-4" />
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <div
        className="pointer-events-none fixed inset-0 -z-10 aurora-bg opacity-70"
        style={{ maskImage: "linear-gradient(to bottom, black, transparent 70%)" }}
      />

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-sidebar-border bg-sidebar/80 backdrop-blur-xl lg:flex">
        {brand}
        {nav}
        {footer}
      </aside>

      {/* Mobile drawer */}
      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col border-r border-sidebar-border bg-sidebar">
            <div className="flex items-center justify-between">
              {brand}
              <button onClick={() => setOpen(false)} className="focus-ring mr-4 rounded-md p-2" aria-label="Close menu">
                <X className="size-4" />
              </button>
            </div>
            {nav}
            {footer}
          </aside>
        </div>
      ) : null}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-background/70 px-4 backdrop-blur-xl sm:px-8">
          <button
            className="focus-ring rounded-md p-2 lg:hidden"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="size-5" />
          </button>
          <Link to="/candidates" className="focus-ring hidden items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground sm:flex">
            <FileSearch className="size-3.5" />
            Semantic candidate search
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <Pill tone="success">
              <ShieldCheck className="size-3" />
              Human-in-the-loop
            </Pill>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1400px] px-4 py-8 sm:px-8">{children}</main>
      </div>
    </div>
  );
}
