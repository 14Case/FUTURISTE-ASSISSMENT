import { NextResponse, type NextRequest } from "next/server";
import { requireApiAdmin, requireApiAuth } from "@/lib/auth/guards";
import {
  computePlayerSessionAssessment,
  persistConsolidatedScore,
} from "@/lib/server/consolidation";
import { scoreOverrideSchema, uuidSchema } from "@/lib/validation/schemas";

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth();
  if (!auth.ok) return auth.response;

  const sessionId = request.nextUrl.searchParams.get("session_id");
  const playerId = request.nextUrl.searchParams.get("player_id");

  // Calcul détaillé temps réel pour un joueur dans une session
  if (
    sessionId &&
    playerId &&
    uuidSchema.safeParse(sessionId).success &&
    uuidSchema.safeParse(playerId).success
  ) {
    try {
      const assessment = await computePlayerSessionAssessment(
        auth.ctx.supabase,
        sessionId,
        playerId,
      );
      return NextResponse.json({ assessment });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Calcul impossible." },
        { status: 404 },
      );
    }
  }

  let query = auth.ctx.supabase
    .from("assessment_scores")
    .select(
      "*, player:players(id, player_number, last_name, first_name, birth_date, is_demo), category:assessment_categories(*)",
    )
    .order("total", { ascending: false });

  if (sessionId) query = query.eq("session_id", sessionId);
  if (playerId) query = query.eq("player_id", playerId);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ scores: data ?? [] });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAdmin();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = scoreOverrideSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Données invalides." },
      { status: 400 },
    );
  }

  const supabase = auth.ctx.supabase;
  const payload = parsed.data;

  try {
    // Vérification : empêcher la validation si des ateliers sont sans barème (unconfigured)
    if (payload.validate) {
      const check = await computePlayerSessionAssessment(
        supabase,
        payload.session_id,
        payload.player_id,
      );
      const unconfigured = check.entries.filter(
        (e) => e.result?.status === "unconfigured",
      );
      if (unconfigured.length > 0) {
        return NextResponse.json(
          {
            error: `Validation refusée : ${unconfigured.length} atelier(s) n'ont pas encore de barème de référence configuré (${unconfigured.map((u) => u.test_code).join(", ")}). Configurez d'abord les seuils dans le module Barèmes.`,
          },
          { status: 409 },
        );
      }
      await supabase.rpc("validate_player_evaluations", {
        p_session_id: payload.session_id,
        p_player_id: payload.player_id,
        p_validate: true,
        p_reason: payload.reason ?? null,
      });
    }

    const score = await persistConsolidatedScore(
      supabase,
      payload.session_id,
      payload.player_id,
      {
        validate: payload.validate,
        analysis_enabled: payload.analysis_enabled,
        coach_comment: payload.coach_comment ?? null,
        override_summary: payload.override_summary ?? null,
        override_recommendations: payload.override_recommendations,
        reason: payload.reason ?? null,
      },
    );

    return NextResponse.json({ score });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur de consolidation." },
      { status: 400 },
    );
  }
}
