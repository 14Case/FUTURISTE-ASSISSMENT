import { NextResponse, type NextRequest } from "next/server";
import { requireApiAdmin, requireApiAuth } from "@/lib/auth/guards";
import {
  sessionInputSchema,
  sessionStatusInputSchema,
  uuidSchema,
} from "@/lib/validation/schemas";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiAuth();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) {
    return NextResponse.json({ error: "Identifiant invalide." }, { status: 400 });
  }

  const { data, error } = await auth.ctx.supabase
    .from("assessment_sessions")
    .select(
      "*, season:seasons(*), categories:session_categories(category:assessment_categories(*)), tests:session_tests(sort_order, test:assessment_tests(*))",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json(
      { error: "Session introuvable ou accès refusé." },
      { status: 404 },
    );
  }

  return NextResponse.json({ session: data });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) {
    return NextResponse.json({ error: "Identifiant invalide." }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const supabase = auth.ctx.supabase;

  // Changement de statut (via RPC set_session_status pour audit et verrouillage finalisation)
  if (body && typeof body === "object" && "status" in body && !("name" in body)) {
    const parsedStatus = sessionStatusInputSchema.safeParse(body);
    if (!parsedStatus.success) {
      return NextResponse.json(
        { error: parsedStatus.error.issues[0]?.message ?? "Statut invalide." },
        { status: 400 },
      );
    }

    // Avant finalisation : consolider automatiquement les scores des joueurs présents
    if (parsedStatus.data.status === "finalized") {
      const { persistConsolidatedScore } = await import("@/lib/server/consolidation");
      const { data: sessionPlayers } = await supabase
        .from("session_players")
        .select("player_id, status")
        .eq("session_id", id);

      for (const sp of sessionPlayers ?? []) {
        if (sp.status !== "withdrawn") {
          await persistConsolidatedScore(supabase, id, sp.player_id, {
            validate: true,
            reason: parsedStatus.data.reason ?? "Finalisation de la session",
          });
        }
      }
    }

    const { data, error } = await supabase.rpc("set_session_status", {
      p_session_id: id,
      p_status: parsedStatus.data.status,
      p_reason: parsedStatus.data.reason ?? null,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ session: data });
  }

  const parsed = sessionInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Données invalides." },
      { status: 400 },
    );
  }

  // Vérifier si la session est finalisée/archivée
  const { data: current } = await supabase
    .from("assessment_sessions")
    .select("status")
    .eq("id", id)
    .maybeSingle();

  if (
    current &&
    (current.status === "finalized" || current.status === "archived") &&
    !parsed.data.reason
  ) {
    return NextResponse.json(
      {
        error:
          "Cette session est finalisée : un motif de correction est obligatoire (ou réouvrez-la d'abord).",
      },
      { status: 409 },
    );
  }

  const { category_ids, test_ids, ...restFields } = parsed.data;
  delete (restFields as Record<string, unknown>).reason;
  const { data: updated, error: updErr } = await supabase
    .from("assessment_sessions")
    .update(restFields)
    .eq("id", id)
    .select("*")
    .single();

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 400 });
  }

  await supabase.from("session_categories").delete().eq("session_id", id);
  await supabase.from("session_categories").insert(
    category_ids.map((category_id) => ({ session_id: id, category_id })),
  );

  await supabase.from("session_tests").delete().eq("session_id", id);
  await supabase.from("session_tests").insert(
    test_ids.map((test_id, idx) => ({
      session_id: id,
      test_id,
      sort_order: idx + 1,
    })),
  );

  return NextResponse.json({ session: updated });
}
