import "server-only";
import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type { Profile } from "@/lib/types/database";

export interface AuthenticatedContext {
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  profile: Profile;
}

export async function getCurrentProfile(): Promise<Profile | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !profile.is_active) return null;
  return profile as Profile;
}

/**
 * Pour les pages Server Components : redirige vers /connexion ou /configuration-requise.
 */
export async function requirePageAuth(): Promise<AuthenticatedContext> {
  if (!isSupabaseConfigured()) {
    redirect("/configuration-requise");
  }
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/connexion");
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !profile.is_active) {
    redirect("/connexion?erreur=compte_inactif");
  }
  return { supabase, profile: profile as Profile };
}

export async function requirePageAdmin(): Promise<AuthenticatedContext> {
  const ctx = await requirePageAuth();
  if (ctx.profile.role !== "admin") {
    redirect("/tableau-de-bord?acces=refuse");
  }
  return ctx;
}

/**
 * Pour les Route Handlers API : renvoie soit le contexte authentifié, soit une NextResponse HTTP 401/403/503.
 */
export async function requireApiAuth(): Promise<
  | { ok: true; ctx: AuthenticatedContext }
  | { ok: false; response: NextResponse }
> {
  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Service Supabase non configuré sur ce serveur." },
        { status: 503 },
      ),
    };
  }
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Authentification requise." },
        { status: 401 },
      ),
    };
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !profile.is_active) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Compte utilisateur inactif ou introuvable." },
        { status: 403 },
      ),
    };
  }
  return { ok: true, ctx: { supabase, profile: profile as Profile } };
}

export async function requireApiAdmin(): Promise<
  | { ok: true; ctx: AuthenticatedContext }
  | { ok: false; response: NextResponse }
> {
  const auth = await requireApiAuth();
  if (!auth.ok) return auth;
  if (auth.ctx.profile.role !== "admin") {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Action réservée aux administrateurs." },
        { status: 403 },
      ),
    };
  }
  return auth;
}
