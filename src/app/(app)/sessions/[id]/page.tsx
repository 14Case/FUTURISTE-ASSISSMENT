import { notFound } from "next/navigation";
import { requirePageAuth } from "@/lib/auth/guards";
import {
  SessionDetailClient,
  type AssignmentRow,
  type SessionPlayerRow,
} from "@/components/sessions/session-detail-client";
import type {
  AssessmentCategory,
  AssessmentSession,
  AssessmentTest,
  Player,
  Profile,
} from "@/lib/types/database";
import { uuidSchema } from "@/lib/validation/schemas";

export default async function SessionDetailPage({
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

  const [
    sessionRes,
    catsRes,
    testsRes,
    spRes,
    evalsRes,
    assignmentsRes,
    allPlayersRes,
    coachesRes,
  ] = await Promise.all([
    supabase
      .from("assessment_sessions")
      .select("*, season:seasons(label)")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("session_categories")
      .select("category:assessment_categories(*)")
      .eq("session_id", id),
    supabase
      .from("session_tests")
      .select("sort_order, test:assessment_tests(*)")
      .eq("session_id", id)
      .order("sort_order"),
    supabase
      .from("session_players")
      .select(
        "*, player:players(id, player_number, last_name, first_name, birth_date, is_demo)",
      )
      .eq("session_id", id)
      .neq("status", "withdrawn"),
    supabase
      .from("test_evaluations")
      .select("player_id, test_id, status")
      .eq("session_id", id),
    supabase
      .from("session_assignments")
      .select("*, user:profiles(id, full_name, email, role)")
      .eq("session_id", id),
    isAdmin
      ? supabase
          .from("players")
          .select(
            "id, player_number, last_name, first_name, birth_date, category_id",
          )
          .eq("status", "active")
          .order("last_name")
      : Promise.resolve({ data: [] }),
    isAdmin
      ? supabase
          .from("profiles")
          .select("id, full_name, email, role")
          .eq("is_active", true)
          .order("full_name")
      : Promise.resolve({ data: [] }),
  ]);

  if (!sessionRes.data) {
    notFound();
  }

  const rawSession = sessionRes.data as Record<string, unknown>;
  const seasonObj = (
    Array.isArray(rawSession.season) ? rawSession.season[0] : rawSession.season
  ) as { label?: string } | null;

  const categories = (catsRes.data ?? [])
    .map((r: { category: unknown }) =>
      Array.isArray(r.category) ? r.category[0] : r.category,
    )
    .filter(Boolean) as AssessmentCategory[];

  const activeTests = (testsRes.data ?? [])
    .map((r: { test: unknown }) =>
      Array.isArray(r.test) ? r.test[0] : r.test,
    )
    .filter(Boolean) as AssessmentTest[];

  const completedByPlayer = new Map<string, number>();
  for (const ev of evalsRes.data ?? []) {
    if (
      ev.status === "completed" ||
      ev.status === "absent" ||
      ev.status === "exempt"
    ) {
      completedByPlayer.set(
        ev.player_id,
        (completedByPlayer.get(ev.player_id) ?? 0) + 1,
      );
    }
  }

  const sessionPlayers: SessionPlayerRow[] = (spRes.data ?? [])
    .map((row: Record<string, unknown>) => {
      const p = (Array.isArray(row.player) ? row.player[0] : row.player) as
        | SessionPlayerRow["player"]
        | null;
      if (!p) return null;
      return {
        id: String(row.id),
        player_id: String(row.player_id),
        category_id: String(row.category_id),
        bib_number: (row.bib_number as string | null) ?? null,
        status: String(row.status),
        player: p,
        completed_tests: completedByPlayer.get(String(row.player_id)) ?? 0,
      };
    })
    .filter((x): x is SessionPlayerRow => Boolean(x))
    .sort((a, b) => a.player.last_name.localeCompare(b.player.last_name, "fr"));

  const assignments: AssignmentRow[] = (assignmentsRes.data ?? []).map(
    (a: Record<string, unknown>) => ({
      id: String(a.id),
      user_id: String(a.user_id),
      test_id: (a.test_id as string | null) ?? null,
      category_id: (a.category_id as string | null) ?? null,
      user: (Array.isArray(a.user) ? a.user[0] : a.user) as AssignmentRow["user"],
    }),
  );

  return (
    <SessionDetailClient
      session={rawSession as unknown as AssessmentSession}
      seasonLabel={seasonObj?.label ?? "2026–2027"}
      categories={categories}
      activeTests={activeTests}
      sessionPlayers={sessionPlayers}
      availablePlayers={(allPlayersRes.data ?? []) as Pick<
        Player,
        | "id"
        | "player_number"
        | "last_name"
        | "first_name"
        | "birth_date"
        | "category_id"
      >[]}
      assignments={assignments}
      coaches={(coachesRes.data ?? []) as Pick<
        Profile,
        "id" | "full_name" | "email" | "role"
      >[]}
      isAdmin={isAdmin}
    />
  );
}
