import { requirePageAuth } from "@/lib/auth/guards";
import { RankingClient } from "@/components/ranking/ranking-client";
import type { RankableEntry } from "@/lib/ranking/compare";
import type { AssessmentCategory, AssessmentSession } from "@/lib/types/database";

export default async function ClassementPage() {
  const { supabase, profile } = await requirePageAuth();

  const [sessionsRes, catsRes, scoresRes] = await Promise.all([
    supabase
      .from("assessment_sessions")
      .select("id, name, session_date")
      .order("session_date", { ascending: false }),
    supabase.from("assessment_categories").select("*").order("sort_order"),
    supabase
      .from("assessment_scores")
      .select(
        "*, player:players(id, player_number, last_name, first_name), category:assessment_categories(id, label)",
      ),
  ]);

  const scoresBySession: Record<string, RankableEntry[]> = {};
  for (const sc of (scoresRes.data ?? []) as Record<string, unknown>[]) {
    const sid = String(sc.session_id);
    const p = (Array.isArray(sc.player) ? sc.player[0] : sc.player) as Record<
      string,
      string
    > | null;
    const c = (Array.isArray(sc.category) ? sc.category[0] : sc.category) as Record<
      string,
      string
    > | null;
    if (!p || !c) continue;

    if (!scoresBySession[sid]) scoresBySession[sid] = [];
    scoresBySession[sid].push({
      player_id: p.id,
      player_number: p.player_number,
      last_name: p.last_name,
      first_name: p.first_name,
      category_id: c.id,
      category_label: c.label,
      is_complete: Boolean(sc.is_complete),
      rubric_version_ids: (sc.rubric_version_ids as string[]) ?? [],
      profile_labels: (sc.profile_labels as string[]) ?? [],
      total: sc.total !== null ? Number(sc.total) : null,
      athletic: sc.athletic !== null ? Number(sc.athletic) : null,
      technical: sc.technical !== null ? Number(sc.technical) : null,
      physical: sc.physical !== null ? Number(sc.physical) : null,
      game_intelligence:
        sc.game_intelligence !== null ? Number(sc.game_intelligence) : null,
      team_spirit: sc.team_spirit !== null ? Number(sc.team_spirit) : null,
    });
  }

  return (
    <RankingClient
      sessions={
        (sessionsRes.data ?? []) as Pick<
          AssessmentSession,
          "id" | "name" | "session_date"
        >[]
      }
      categories={(catsRes.data ?? []) as AssessmentCategory[]}
      scoresBySession={scoresBySession}
      isAdmin={profile.role === "admin"}
    />
  );
}
