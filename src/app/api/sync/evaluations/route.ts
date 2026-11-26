import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/auth/guards";
import { scoreTest, suggestEvaluationStatus } from "@/lib/scoring/engine";
import {
  resolveRubricRow,
  testInputToAttempts,
  toResolved,
  type RubricRow,
} from "@/lib/scoring/resolve";
import { syncBatchSchema } from "@/lib/validation/schemas";

/**
 * Point d'entrée unique de saisie & synchronisation terrain (idempotent via op_id).
 *
 * Sécurité & fiabilité (Sections 10, 11, 12, 18) :
 * - Recalcule systématiquement les points côté serveur à partir du barème de référence actif.
 * - Si le barème n'a pas de seuils configurés (`unconfigured`), les tentatives brutes sont
 *   enregistrées sans score inventé (`points = null`, `score_status = 'unconfigured'`).
 * - Applique la transaction via `apply_evaluation_op` (SECURITY INVOKER → RLS active).
 */
export async function POST(request: Request) {
  const auth = await requireApiAuth();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = syncBatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Lot de synchronisation invalide.",
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  const supabase = auth.ctx.supabase;
  const ops = parsed.data.operations;

  const testIds = [...new Set(ops.map((o) => o.test_id))];
  const sessionIds = [...new Set(ops.map((o) => o.session_id))];
  const playerIds = [...new Set(ops.map((o) => o.player_id))];

  const [testsRes, rubricsRes, spRes, playersRes, settingsRes] = await Promise.all([
    supabase
      .from("assessment_tests")
      .select("id, code, max_points")
      .in("id", testIds),
    supabase
      .from("rubric_versions")
      .select("*")
      .in("test_id", testIds)
      .eq("status", "active"),
    supabase
      .from("session_players")
      .select("session_id, player_id, category_id")
      .in("session_id", sessionIds)
      .in("player_id", playerIds),
    supabase.from("players").select("id, sex").in("id", playerIds),
    supabase
      .from("club_settings")
      .select("sex_field_enabled")
      .eq("id", 1)
      .maybeSingle(),
  ]);

  const testById = new Map((testsRes.data ?? []).map((t) => [t.id, t]));
  const playerById = new Map((playersRes.data ?? []).map((p) => [p.id, p]));
  const spByKey = new Map(
    (spRes.data ?? []).map((sp) => [`${sp.session_id}:${sp.player_id}`, sp]),
  );
  const activeRubrics = (rubricsRes.data ?? []) as RubricRow[];
  const useSex = settingsRes.data?.sex_field_enabled ?? true;

  const results: Record<string, unknown>[] = [];

  for (const op of ops) {
    const test = testById.get(op.test_id);
    const sp = spByKey.get(`${op.session_id}:${op.player_id}`);
    const player = playerById.get(op.player_id);

    if (!test || !sp || !player) {
      results.push({
        op_id: op.op_id,
        status: "rejected",
        error: "Joueur, session ou atelier introuvable / non autorisé.",
      });
      continue;
    }

    const rubricRow = resolveRubricRow(
      activeRubrics,
      test.id,
      sp.category_id,
      player.sex ?? null,
      useSex,
    );
    const resolved = toResolved(rubricRow, test.code, Number(test.max_points));

    const testInput = {
      status: op.status,
      components: op.components,
    };

    const scoreRes = scoreTest(resolved, testInput);
    if (scoreRes.status === "invalid") {
      results.push({
        op_id: op.op_id,
        status: "rejected",
        error:
          scoreRes.issues[0]?.message ??
          "Valeurs hors limites pour cet atelier.",
      });
      continue;
    }

    const effectiveStatus = suggestEvaluationStatus(resolved, testInput);
    const attemptRows = testInputToAttempts(testInput);

    const { data: rpcRes, error: rpcErr } = await supabase.rpc(
      "apply_evaluation_op",
      {
        p_op_id: op.op_id,
        p_session_id: op.session_id,
        p_player_id: op.player_id,
        p_test_id: op.test_id,
        p_base_version: op.base_version,
        p_supersedes: op.supersedes,
        p_status: effectiveStatus,
        p_rubric_version_id: rubricRow?.id ?? null,
        p_points: scoreRes.points,
        p_score_status: scoreRes.status,
        p_component_scores: scoreRes.components,
        p_comment: op.comment ?? null,
        p_attempts: attemptRows,
        p_reason: op.reason ?? null,
      },
    );

    if (rpcErr || !rpcRes) {
      results.push({
        op_id: op.op_id,
        status: "rejected",
        error: rpcErr?.message ?? "Refusé par les règles de sécurité.",
      });
      continue;
    }

    results.push({
      op_id: op.op_id,
      ...(rpcRes as Record<string, unknown>),
      points: scoreRes.points,
      score_status: scoreRes.status,
    });
  }

  return NextResponse.json({ results });
}
