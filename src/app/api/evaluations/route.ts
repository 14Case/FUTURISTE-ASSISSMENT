import { NextResponse, type NextRequest } from "next/server";
import { requireApiAuth } from "@/lib/auth/guards";

/**
 * API d'intégration (Section 22) : récupération des évaluations filtrées par session ou joueur.
 */
export async function GET(request: NextRequest) {
  const auth = await requireApiAuth();
  if (!auth.ok) return auth.response;

  const sessionId = request.nextUrl.searchParams.get("session_id");
  const playerId = request.nextUrl.searchParams.get("player_id");

  let query = auth.ctx.supabase
    .from("test_evaluations")
    .select("*, attempts:test_attempts(*)")
    .order("updated_at", { ascending: false });

  if (sessionId) query = query.eq("session_id", sessionId);
  if (playerId) query = query.eq("player_id", playerId);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ evaluations: data ?? [] });
}
