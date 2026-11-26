import { NextResponse, type NextRequest } from "next/server";
import { requireApiAdmin } from "@/lib/auth/guards";
import { sessionPlayersBatchSchema, uuidSchema } from "@/lib/validation/schemas";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiAdmin();
  if (!auth.ok) return auth.response;

  const { id: sessionId } = await params;
  if (!uuidSchema.safeParse(sessionId).success) {
    return NextResponse.json({ error: "Identifiant invalide." }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = sessionPlayersBatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Données invalides." },
      { status: 400 },
    );
  }

  const rows = parsed.data.players.map((p) => ({
    session_id: sessionId,
    player_id: p.player_id,
    category_id: p.category_id,
    bib_number: p.bib_number ?? null,
    status: "registered" as const,
  }));

  const { data, error } = await auth.ctx.supabase
    .from("session_players")
    .upsert(rows, { onConflict: "session_id,player_id" })
    .select("*");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ session_players: data ?? [] });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiAdmin();
  if (!auth.ok) return auth.response;

  const { id: sessionId } = await params;
  const playerId = request.nextUrl.searchParams.get("player_id") ?? "";
  if (
    !uuidSchema.safeParse(sessionId).success ||
    !uuidSchema.safeParse(playerId).success
  ) {
    return NextResponse.json({ error: "Identifiants invalides." }, { status: 400 });
  }

  // Empêcher le retrait pur et simple si des évaluations existent déjà (proposer statut retiré)
  const { count } = await auth.ctx.supabase
    .from("test_evaluations")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId)
    .eq("player_id", playerId);

  if ((count ?? 0) > 0) {
    const { error: updErr } = await auth.ctx.supabase
      .from("session_players")
      .update({ status: "withdrawn" })
      .eq("session_id", sessionId)
      .eq("player_id", playerId);
    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true, mode: "withdrawn" });
  }

  const { error } = await auth.ctx.supabase
    .from("session_players")
    .delete()
    .eq("session_id", sessionId)
    .eq("player_id", playerId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, mode: "deleted" });
}
