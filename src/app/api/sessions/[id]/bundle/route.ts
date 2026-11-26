import { NextResponse, type NextRequest } from "next/server";
import { requireApiAuth } from "@/lib/auth/guards";
import { uuidSchema } from "@/lib/validation/schemas";

/**
 * Retourne le lot complet d'une session pour le préchargement hors ligne (PWA IndexedDB).
 * Les politiques RLS filtrent automatiquement les joueurs, affectations et évaluations
 * selon les droits réels de l'encadreur connecté.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiAuth();
  if (!auth.ok) return auth.response;

  const { id: sessionId } = await params;
  if (!uuidSchema.safeParse(sessionId).success) {
    return NextResponse.json({ error: "Identifiant invalide." }, { status: 400 });
  }

  const supabase = auth.ctx.supabase;
  const [
    sessionRes,
    catsRes,
    domainsRes,
    testsRes,
    ageRulesRes,
    rubricsRes,
    assignmentsRes,
    playersRes,
    evaluationsRes,
    settingsRes,
  ] = await Promise.all([
    supabase
      .from("assessment_sessions")
      .select("*")
      .eq("id", sessionId)
      .maybeSingle(),
    supabase
      .from("session_categories")
      .select("category:assessment_categories(*)")
      .eq("session_id", sessionId),
    supabase.from("assessment_domains").select("*").order("sort_order"),
    supabase
      .from("session_tests")
      .select("sort_order, test:assessment_tests(*)")
      .eq("session_id", sessionId)
      .order("sort_order"),
    supabase.from("test_age_rules").select("*"),
    supabase.from("rubric_versions").select("*").eq("status", "active"),
    supabase
      .from("session_assignments")
      .select("*")
      .eq("session_id", sessionId),
    supabase
      .from("session_players")
      .select(
        "*, player:players(id, player_number, last_name, first_name, birth_date, sex, preferred_position, dominant_foot, is_demo)",
      )
      .eq("session_id", sessionId)
      .neq("status", "withdrawn"),
    supabase
      .from("test_evaluations")
      .select("*, attempts:test_attempts(*)")
      .eq("session_id", sessionId),
    supabase.from("club_settings").select("sex_field_enabled").eq("id", 1).maybeSingle(),
  ]);

  if (sessionRes.error || !sessionRes.data) {
    return NextResponse.json(
      { error: "Session introuvable ou vous n'y êtes pas affecté." },
      { status: 404 },
    );
  }

  const categories = (catsRes.data ?? [])
    .map((r: { category: unknown }) =>
      Array.isArray(r.category) ? r.category[0] : r.category,
    )
    .filter(Boolean);

  const tests = (testsRes.data ?? [])
    .map((r: { test: unknown }) => (Array.isArray(r.test) ? r.test[0] : r.test))
    .filter(Boolean);

  const sessionPlayers = (playersRes.data ?? [])
    .map((sp: Record<string, unknown>) => ({
      ...sp,
      player: Array.isArray(sp.player) ? sp.player[0] : sp.player,
    }))
    .filter((sp: Record<string, unknown>) => Boolean(sp.player));

  return NextResponse.json({
    session_id: sessionId,
    session: sessionRes.data,
    categories,
    domains: domainsRes.data ?? [],
    tests,
    age_rules: ageRulesRes.data ?? [],
    rubrics: rubricsRes.data ?? [],
    assignments: assignmentsRes.data ?? [],
    session_players: sessionPlayers,
    evaluations: evaluationsRes.data ?? [],
    sex_field_enabled: settingsRes.data?.sex_field_enabled ?? true,
  });
}
