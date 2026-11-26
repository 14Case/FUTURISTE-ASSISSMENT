import { notFound } from "next/navigation";
import { requirePageAuth } from "@/lib/auth/guards";
import { computePlayerSessionAssessment } from "@/lib/server/consolidation";
import {
  PlayerDetailClient,
  type SessionHistoryBundle,
} from "@/components/players/player-detail-client";
import type { AssessmentReport, GuardianLink, Player } from "@/lib/types/database";
import { DEFAULT_PARENT_MESSAGE } from "@/lib/scoring/default-catalog";
import { uuidSchema } from "@/lib/validation/schemas";

export default async function JoueurProfilPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) {
    notFound();
  }

  const { supabase, profile } = await requirePageAuth();
  const isAdmin = profile.role === "admin";

  const selectCols = isAdmin
    ? "*, guardians:player_guardians(relationship, is_primary, guardian:guardians(*))"
    : "*";

  const [playerRes, participationsRes, reportsRes, settingsRes] = await Promise.all([
    supabase.from("players").select(selectCols).eq("id", id).maybeSingle(),
    supabase
      .from("session_players")
      .select(
        "session_id, session:assessment_sessions(id, name, session_date, season:seasons(label))",
      )
      .eq("player_id", id),
    isAdmin
      ? supabase
          .from("assessment_reports")
          .select("*")
          .eq("player_id", id)
          .neq("status", "archived")
          .order("version", { ascending: false })
      : Promise.resolve({ data: [] }),
    supabase
      .from("club_settings")
      .select("parent_message_template")
      .eq("id", 1)
      .maybeSingle(),
  ]);

  if (!playerRes.data) {
    notFound();
  }

  const rawPlayer = playerRes.data as unknown as Record<string, unknown>;
  const guardians: GuardianLink[] = Array.isArray(rawPlayer.guardians)
    ? rawPlayer.guardians.map((g: Record<string, unknown>) => ({
        relationship: (g.relationship as string | null) ?? null,
        is_primary: Boolean(g.is_primary),
        guardian: (Array.isArray(g.guardian) ? g.guardian[0] : g.guardian) as GuardianLink["guardian"],
      }))
    : [];

  const reports = (reportsRes.data ?? []) as AssessmentReport[];
  const reportBySession = new Map<string, AssessmentReport>();
  for (const r of reports) {
    if (!reportBySession.has(r.session_id)) {
      reportBySession.set(r.session_id, r);
    }
  }

  const participations = (participationsRes.data ?? [])
    .map((p: Record<string, unknown>) => {
      const s = (Array.isArray(p.session) ? p.session[0] : p.session) as {
        id: string;
        name: string;
        session_date: string;
        season?: { label?: string } | { label?: string }[];
      } | null;
      if (!s) return null;
      const seasonObj = Array.isArray(s.season) ? s.season[0] : s.season;
      return {
        session_id: s.id,
        session_name: s.name,
        session_date: s.session_date,
        season_label: seasonObj?.label ?? "2026–2027",
      };
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x))
    .sort((a, b) => b.session_date.localeCompare(a.session_date));

  const history: SessionHistoryBundle[] = [];
  for (const part of participations) {
    try {
      const assessment = await computePlayerSessionAssessment(
        supabase,
        part.session_id,
        id,
      );
      history.push({
        ...part,
        assessment,
        latest_report: reportBySession.get(part.session_id) ?? null,
      });
    } catch {
      // Session non autorisée pour cet encadreur : filtrée proprement
    }
  }

  return (
    <PlayerDetailClient
      player={rawPlayer as unknown as Player}
      guardians={guardians}
      history={history}
      isAdmin={isAdmin}
      parentMessageTemplate={
        settingsRes.data?.parent_message_template || DEFAULT_PARENT_MESSAGE
      }
    />
  );
}
