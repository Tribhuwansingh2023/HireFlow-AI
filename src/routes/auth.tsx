import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Lock, Mail, ShieldCheck, User } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { errorMessage } from "@/lib/audit";
import { InlineAlert } from "@/components/ui-kit";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — HireFlow AI" },
      { name: "description", content: "Sign in to the HireFlow AI recruitment workspace." },
      { property: "og:title", content: "Sign in — HireFlow AI" },
      { property: "og:description", content: "Access your agentic recruitment workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

const schema = z.object({
  email: z.string().trim().email("Enter a valid work email").max(255),
  password: z.string().min(8, "Password must be at least 8 characters").max(72),
  fullName: z.string().trim().max(80).optional(),
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse({ email, password, fullName });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Check your details");
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: parsed.data.email,
          password: parsed.data.password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { full_name: parsed.data.fullName || parsed.data.email.split("@")[0] },
          },
        });
        if (error) throw error;
        if (!data.session) {
          setNotice("Check your inbox to confirm your email address, then sign in.");
          toast.success("Account created — confirm your email to continue.");
          return;
        }
        toast.success("Welcome to HireFlow AI");
        navigate({ to: "/dashboard", replace: true });
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: parsed.data.email,
          password: parsed.data.password,
        });
        if (error) throw error;
        toast.success("Signed in");
        navigate({ to: "/dashboard", replace: true });
      }
    } catch (error) {
      toast.error(errorMessage(error, "Authentication failed"));
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: window.location.origin,
        },
      });
      if (error) {
        toast.error(errorMessage(error, "Google sign-in failed"));
        setBusy(false);
      }
      // Note: Success redirects the browser automatically, so we don't unset busy
    } catch (error) {
      toast.error(errorMessage(error, "Google sign-in failed"));
      setBusy(false);
    }
  };

  return (
    <div className="relative grid min-h-screen place-items-center px-4 py-12">
      <div className="pointer-events-none fixed inset-0 -z-10 aurora-bg" />

      <div className="w-full max-w-md">
        <Link to="/" className="focus-ring mb-8 flex items-center justify-center gap-3 rounded">
          <span
            className="grid size-10 place-items-center rounded-xl text-sm font-bold"
            style={{ backgroundImage: "var(--gradient-primary)", color: "var(--primary-foreground)" }}
          >
            HF
          </span>
          <span className="font-display text-lg font-semibold">HireFlow AI</span>
        </Link>

        <div className="glass-panel rise-in rounded-2xl p-7">
          <h1 className="font-display text-xl font-semibold">
            {mode === "signin" ? "Sign in to your workspace" : "Create your workspace account"}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {mode === "signin"
              ? "Continue orchestrating your hiring pipeline."
              : "The first account created becomes the workspace administrator."}
          </p>

          {notice ? (
            <div className="mt-5">
              <InlineAlert tone="info" title="Confirm your email">
                {notice}
              </InlineAlert>
            </div>
          ) : null}

          <form onSubmit={submit} className="mt-6 space-y-4">
            {mode === "signup" ? (
              <Field
                icon={<User className="size-4" />}
                label="Full name"
                value={fullName}
                onChange={setFullName}
                placeholder="Ada Lovelace"
                autoComplete="name"
              />
            ) : null}
            <Field
              icon={<Mail className="size-4" />}
              label="Work email"
              type="email"
              value={email}
              onChange={setEmail}
              placeholder="you@company.com"
              autoComplete="email"
              required
            />
            <Field
              icon={<Lock className="size-4" />}
              label="Password"
              type="password"
              value={password}
              onChange={setPassword}
              placeholder="At least 8 characters"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              required
            />

            <button
              type="submit"
              disabled={busy}
              className="focus-ring flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
              style={{ backgroundImage: "var(--gradient-primary)", color: "var(--primary-foreground)" }}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              {mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>

          <div className="my-5 flex items-center gap-3 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            or
            <span className="h-px flex-1 bg-border" />
          </div>

          <button
            onClick={google}
            disabled={busy}
            className="focus-ring flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 py-3 text-sm font-medium transition-colors hover:border-primary/40 disabled:opacity-60"
          >
            <GoogleMark />
            Continue with Google
          </button>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            {mode === "signin" ? "No account yet?" : "Already have an account?"}{" "}
            <button
              onClick={() => {
                setMode(mode === "signin" ? "signup" : "signin");
                setNotice(null);
              }}
              className="focus-ring rounded font-medium text-primary hover:underline"
            >
              {mode === "signin" ? "Create one" : "Sign in"}
            </button>
          </p>
        </div>

        <p className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5 text-success" />
          Row-level security enforced on every record
        </p>
      </div>
    </div>
  );
}

function Field({
  icon,
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  autoComplete,
  required,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  required?: boolean;
}) {
  const id = label.toLowerCase().replace(/\s+/g, "-");
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
          {icon}
        </span>
        <input
          id={id}
          type={type}
          value={value}
          required={required}
          autoComplete={autoComplete}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="focus-ring w-full rounded-xl border border-input bg-background/60 py-2.5 pl-10 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary/50"
        />
      </div>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path fill="#4285F4" d="M23.5 12.3c0-.9-.1-1.5-.2-2.2H12v4.1h6.6a5.7 5.7 0 0 1-2.5 3.7v3h4c2.3-2.2 3.4-5.3 3.4-8.6Z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-4-3c-1.1.7-2.5 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9h-4v3.1A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.4 14.4a7.2 7.2 0 0 1 0-4.6V6.7h-4a12 12 0 0 0 0 10.8l4-3.1Z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.4 6.7l4 3.1C6.3 6.9 8.9 4.8 12 4.8Z" />
    </svg>
  );
}
