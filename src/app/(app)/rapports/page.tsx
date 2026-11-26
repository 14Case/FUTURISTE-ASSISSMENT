import { requirePageAdmin } from "@/lib/auth/guards";
import {
  ReportsCenterClient,
  type ReportRowItem,
  type SessionParticipantLite,
} from "@/components/reports/reports-center-client";
import { DEFAULT_PARENT_MESSAGE } from "@/lib/scoring/default-catalog";

export default async function RapportsPage() {
  const { supabase } = await requirePageAdmin();

  const [sessionsRes, reportsRes, spRes, settingsRes] = await Promise.all([
    supabase
      .from("assessment_sessions")
      .select("id, name, session_date, season:seasons(label)")
      .order("session_date", { ascending: false }),
    supabase
      .from("assessment_reports")
      .select(
        "*, player:players(id, player_number, last_name, first_name, is_demo, guardians:player_guardians(is_primary, guardian:guardians(phone, whatsapp, email)))",
      )
      .neq("status", "archived")
      .order("generated_at", { ascending: false }),
    supabase
      .from("session_players")
      .select("session_id, player_id, player:players(last_name, first_name)")
      .neq("status", "withdrawn"),
    supabase
      .from("club_settings")
      .select("parent_message_template")
      .eq("id", 1)
      .maybeSingle(),
  ]);

  const sessions = (sessionsRes.data ?? []).map((s: Record<string, unknown>) => {
    const seasonObj = (
      Array.isArray(s.season) ? s.season[0] : s.season
    ) as { label?: string } | null;
    return {
      id: String(s.id),
      name: String(s.name),
      session_date: String(s.session_date),
      season_label: seasonObj?.label ?? "2026–2027",
    };
  });

  const reports: ReportRowItem[] = (reportsRes.data ?? [])
    .map((r: Record<string, unknown>) => {
      const p = (Array.isArray(r.player) ? r.player[0] : r.player) as Record<
        string,
        unknown
      > | null;
      if (!p) return null;
      const gLinks = Array.isArray(p.guardians) ? p.guardians : [];
      const primaryLink =
        gLinks.find((g: Record<string, unknown>) => g.is_primary) ?? gLinks[0];
      const guardianObj = primaryLink
        ? ((Array.isArray(primaryLink.guardian)
            ? primaryLink.guardian[0]
            : primaryLink.guardian) as ReportRowItem["guardian"])
        : null;

      return {
        id: String(r.id),
        session_id: String(r.session_id),
        player_id: String(r.player_id),
        file_name: String(r.file_name),
        version: Number(r.version),
        status: r.status as ReportRowItem["status"],
        file_size: r.file_size !== null ? Number(r.file_size) : null,
        generated_at: String(r.generated_at),
        player: {
          id: String(p.id),
          player_number: String(p.player_number),
          last_name: String(p.last_name),
          first_name: String(p.first_name),
          is_demo: Boolean(p.is_demo),
        },
        guardian: guardianObj,
      };
    })
    .filter((x): x is ReportRowItem => Boolean(x));

  const participants: SessionParticipantLite[] = (spRes.data ?? []).map(
    (sp: Record<string, unknown>) => {
      const p = (Array.isArray(sp.player) ? sp.player[0] : sp.player) as {
        last_name?: string;
        first_name?: string;
      } | null;
      return {
        session_id: String(sp.session_id),
        player_id: String(sp.player_id),
        player_label: p ? `${p.last_name} ${p.first_name}` : "",
      };
    },
  );

  return (
    <ReportsCenterClient
      sessions={sessions}
      reports={reports}
      participants={participants}
      parentMessageTemplate={
        settingsRes.data?.parent_message_template || DEFAULT_PARENT_MESSAGE
      }
    />
  );
}
