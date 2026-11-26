import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { requireApiAdmin } from "@/lib/auth/guards";
import { generatePlayerReportPdfBuffer } from "@/lib/pdf/report-document";
import {
  computePlayerSessionAssessment,
  persistConsolidatedScore,
} from "@/lib/server/consolidation";
import { buildReportFileName } from "@/lib/utils";
import { uuidSchema } from "@/lib/validation/schemas";

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin();
  if (!auth.ok) return auth.response;

  const sessionId = request.nextUrl.searchParams.get("session_id");
  const playerId = request.nextUrl.searchParams.get("player_id");

  let query = auth.ctx.supabase
    .from("assessment_reports")
    .select(
      "*, player:players(id, player_number, last_name, first_name, is_demo), session:assessment_sessions(id, name, session_date)",
    )
    .order("generated_at", { ascending: false });

  if (sessionId) query = query.eq("session_id", sessionId);
  if (playerId) query = query.eq("player_id", playerId);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ reports: data ?? [] });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAdmin();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const sessionId = body?.session_id;
  const playerIds: string[] = Array.isArray(body?.player_ids)
    ? body.player_ids
    : body?.player_id
      ? [body.player_id]
      : [];

  if (
    !uuidSchema.safeParse(sessionId).success ||
    playerIds.length === 0 ||
    !playerIds.every((id) => uuidSchema.safeParse(id).success)
  ) {
    return NextResponse.json(
      { error: "Session et joueur(s) valides requis." },
      { status: 400 },
    );
  }

  const supabase = auth.ctx.supabase;

  const { data: sessionRow } = await supabase
    .from("assessment_sessions")
    .select("id, season:seasons(label)")
    .eq("id", sessionId)
    .maybeSingle();

  const rawSeason = sessionRow?.season as unknown;
  const seasonLabel =
    (Array.isArray(rawSeason)
      ? (rawSeason[0] as { label?: string } | undefined)?.label
      : (rawSeason as { label?: string } | null | undefined)?.label) ?? "2026–2027";

  const generatedReports: Record<string, unknown>[] = [];
  const errors: { player_id: string; error: string }[] = [];

  for (const playerId of playerIds) {
    try {
      // Consolide d'abord le score (sans forcer la validation finale si non finalisé)
      const { data: currentSession } = await supabase
        .from("assessment_sessions")
        .select("status")
        .eq("id", sessionId)
        .single();

      let scoreRow = null;
      if (
        currentSession &&
        currentSession.status !== "finalized" &&
        currentSession.status !== "archived"
      ) {
        scoreRow = await persistConsolidatedScore(supabase, sessionId, playerId);
      }

      const assessment = await computePlayerSessionAssessment(
        supabase,
        sessionId,
        playerId,
      );
      const generatedAtIso = new Date().toISOString();

      const pdfBuffer = await generatePlayerReportPdfBuffer({
        assessment,
        seasonLabel,
        validatorName: auth.ctx.profile.full_name || null,
        generatedAtIso,
      });

      const { data: prevReports } = await supabase
        .from("assessment_reports")
        .select("id, version, status")
        .eq("session_id", sessionId)
        .eq("player_id", playerId)
        .order("version", { ascending: false });

      const nextVersion = ((prevReports ?? [])[0]?.version ?? 0) + 1;

      // Archiver les versions antérieures actives
      const activePrevIds = (prevReports ?? [])
        .filter((r) => r.status !== "archived")
        .map((r) => r.id);
      if (activePrevIds.length > 0) {
        await supabase
          .from("assessment_reports")
          .update({ status: "archived", archived_at: generatedAtIso })
          .in("id", activePrevIds);
      }

      const fileName = buildReportFileName(
        assessment.player.last_name,
        assessment.player.first_name,
        assessment.session.session_date,
      );
      const storagePath = `${sessionId}/${playerId}/v${nextVersion}_${fileName}`;
      const checksum = createHash("sha256").update(pdfBuffer).digest("hex");

      const { error: uploadErr } = await supabase.storage
        .from("reports")
        .upload(storagePath, pdfBuffer, {
          contentType: "application/pdf",
          upsert: true,
        });

      if (uploadErr) {
        throw new Error(`Stockage privé Supabase : ${uploadErr.message}`);
      }

      const { data: reportRecord, error: insertErr } = await supabase
        .from("assessment_reports")
        .insert({
          session_id: sessionId,
          player_id: playerId,
          score_id: scoreRow?.id ?? assessment.stored_score?.id ?? null,
          storage_path: storagePath,
          file_name: fileName,
          version: nextVersion,
          status: "generated",
          file_size: pdfBuffer.byteLength,
          checksum,
          page_count: 4,
          generated_by: auth.ctx.profile.id,
          generated_at: generatedAtIso,
        })
        .select("*")
        .single();

      if (insertErr) {
        throw new Error(insertErr.message);
      }

      generatedReports.push(reportRecord);
    } catch (err) {
      errors.push({
        player_id: playerId,
        error: err instanceof Error ? err.message : "Échec génération PDF.",
      });
    }
  }

  return NextResponse.json({
    reports: generatedReports,
    errors,
  });
}
