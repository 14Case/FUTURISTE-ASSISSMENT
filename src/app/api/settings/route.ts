import { NextResponse } from "next/server";
import { requireApiAdmin, requireApiAuth } from "@/lib/auth/guards";
import {
  categoryInputSchema,
  clubSettingsInputSchema,
  seasonInputSchema,
  uuidSchema,
} from "@/lib/validation/schemas";

export async function GET() {
  const auth = await requireApiAuth();
  if (!auth.ok) return auth.response;

  const [settingsRes, seasonsRes, categoriesRes] = await Promise.all([
    auth.ctx.supabase.from("club_settings").select("*").eq("id", 1).maybeSingle(),
    auth.ctx.supabase
      .from("seasons")
      .select("*")
      .order("label", { ascending: false }),
    auth.ctx.supabase
      .from("assessment_categories")
      .select("*")
      .order("sort_order"),
  ]);

  return NextResponse.json({
    club_settings: settingsRes.data ?? null,
    seasons: seasonsRes.data ?? [],
    categories: categoriesRes.data ?? [],
  });
}

export async function PATCH(request: Request) {
  const auth = await requireApiAdmin();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const supabase = auth.ctx.supabase;

  // Création / modification d'une saison
  if (body?.kind === "season") {
    const parsed = seasonInputSchema.safeParse(body.data);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Saison invalide." },
        { status: 400 },
      );
    }
    const { data, error } = await supabase
      .from("seasons")
      .insert(parsed.data)
      .select("*")
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ season: data });
  }

  // Création / modification d'une catégorie
  if (body?.kind === "category") {
    const parsed = categoryInputSchema.safeParse(body.data);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Catégorie invalide." },
        { status: 400 },
      );
    }
    if (body.id && uuidSchema.safeParse(body.id).success) {
      const { data, error } = await supabase
        .from("assessment_categories")
        .update(parsed.data)
        .eq("id", body.id)
        .select("*")
        .single();
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      return NextResponse.json({ category: data });
    }
    const { data, error } = await supabase
      .from("assessment_categories")
      .insert(parsed.data)
      .select("*")
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ category: data });
  }

  // Mise à jour des paramètres généraux du club
  const parsed = clubSettingsInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Paramètres invalides." },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("club_settings")
    .upsert({
      id: 1,
      ...parsed.data,
      updated_by: auth.ctx.profile.id,
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ club_settings: data });
}
