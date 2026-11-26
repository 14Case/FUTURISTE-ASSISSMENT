import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/auth/guards";

/**
 * Gestion explicite et contrôlée d'un jeu d'essai identifié "DEMO" (Section 4) :
 * - Aucune donnée fictive n'est injectée par défaut en production.
 * - Un administrateur peut créer explicitement 3 fiches joueurs [DEMO] pour
 *   tester la saisie terrain et le rendu PDF, puis tout purger en un clic.
 */
export async function POST() {
  const auth = await requireApiAdmin();
  if (!auth.ok) return auth.response;

  const supabase = auth.ctx.supabase;
  const { data: cats } = await supabase
    .from("assessment_categories")
    .select("id, code")
    .order("sort_order");

  const catMap = new Map((cats ?? []).map((c) => [c.code, c.id]));

  const demoPlayers = [
    {
      last_name: "MBAPPE_DEMO",
      first_name: "Samuel",
      birth_date: "2018-04-12",
      sex: "M" as const,
      category_id: catMap.get("U6-U9") ?? null,
      preferred_position: "Polyvalent / En découverte",
      dominant_foot: "right" as const,
      academy_entry_year: 2026,
      consent_obtained: true,
      consent_date: "2026-11-25",
      notes: "Fiche de démonstration — supprimable depuis Paramètres.",
      is_demo: true,
      created_by: auth.ctx.profile.id,
    },
    {
      last_name: "NGONO_DEMO",
      first_name: "Clarisse",
      birth_date: "2014-09-03",
      sex: "F" as const,
      category_id: catMap.get("U10-U13") ?? null,
      preferred_position: "Milieu offensif",
      dominant_foot: "left" as const,
      academy_entry_year: 2026,
      consent_obtained: true,
      consent_date: "2026-11-25",
      notes: "Fiche de démonstration — supprimable depuis Paramètres.",
      is_demo: true,
      created_by: auth.ctx.profile.id,
    },
    {
      last_name: "ETOUNDI_DEMO",
      first_name: "Brice",
      birth_date: "2011-06-21",
      sex: "M" as const,
      category_id: catMap.get("U14-U16") ?? null,
      preferred_position: "Milieu relayeur",
      dominant_foot: "both" as const,
      academy_entry_year: 2025,
      consent_obtained: true,
      consent_date: "2026-11-25",
      notes: "Fiche de démonstration — supprimable depuis Paramètres.",
      is_demo: true,
      created_by: auth.ctx.profile.id,
    },
  ];

  const { data: created, error } = await supabase
    .from("players")
    .insert(demoPlayers)
    .select("*");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ created: created?.length ?? 0 });
}

export async function DELETE() {
  const auth = await requireApiAdmin();
  if (!auth.ok) return auth.response;

  const supabase = auth.ctx.supabase;

  // Récupérer les joueurs et sessions DEMO
  const { data: demoPlayers } = await supabase
    .from("players")
    .select("id")
    .eq("is_demo", true);

  const playerIds = (demoPlayers ?? []).map((p) => p.id);

  if (playerIds.length > 0) {
    // Nettoyer d'abord les enregistrements enfants liés aux joueurs DEMO
    const { data: demoReports } = await supabase
      .from("assessment_reports")
      .select("storage_path")
      .in("player_id", playerIds);

    if (demoReports && demoReports.length > 0) {
      await supabase.storage
        .from("reports")
        .remove(demoReports.map((r) => r.storage_path));
    }

    await supabase.from("assessment_reports").delete().in("player_id", playerIds);
    await supabase.from("assessment_scores").delete().in("player_id", playerIds);
    await supabase.from("test_evaluations").delete().in("player_id", playerIds);
    await supabase.from("session_players").delete().in("player_id", playerIds);
    await supabase.from("players").delete().in("id", playerIds);
  }

  await supabase.from("guardians").delete().eq("is_demo", true);
  await supabase.from("assessment_sessions").delete().eq("is_demo", true);

  return NextResponse.json({
    ok: true,
    purged_players: playerIds.length,
  });
}
