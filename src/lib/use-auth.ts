import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "recruiter" | "hiring_manager" | "viewer";

export type AuthState = {
  loading: boolean;
  session: Session | null;
  user: User | null;
  roles: AppRole[];
  profile: { id: string; full_name: string | null; email: string | null; title: string | null } | null;
};

const initial: AuthState = { loading: true, session: null, user: null, roles: [], profile: null };

export function useAuth(): AuthState & { canWrite: boolean; isAdmin: boolean } {
  const [state, setState] = useState<AuthState>(initial);

  useEffect(() => {
    let active = true;

    const hydrate = async (session: Session | null) => {
      if (!session?.user) {
        if (active) setState({ ...initial, loading: false });
        return;
      }
      const [{ data: roles }, { data: profile }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", session.user.id),
        supabase.from("profiles").select("id, full_name, email, title").eq("id", session.user.id).maybeSingle(),
      ]);
      if (!active) return;
      setState({
        loading: false,
        session,
        user: session.user,
        roles: (roles ?? []).map((r) => r.role as AppRole),
        profile: profile ?? null,
      });
    };

    supabase.auth.getSession().then(({ data }) => hydrate(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      void hydrate(session);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const isAdmin = state.roles.includes("admin");
  const canWrite = isAdmin || state.roles.includes("recruiter") || state.roles.includes("hiring_manager");
  return { ...state, canWrite, isAdmin };
}

export const ROLE_LABEL: Record<AppRole, string> = {
  admin: "Administrator",
  recruiter: "Recruiter",
  hiring_manager: "Hiring manager",
  viewer: "Viewer",
};
