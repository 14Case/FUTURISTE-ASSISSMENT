import { requirePageAuth } from "@/lib/auth/guards";
import { SessionsListClient } from "@/components/sessions/sessions-list-client";
import type {
  AssessmentCategory,
  AssessmentSession,
  AssessmentTest,
  Season,
} from "@/lib/types/database";

export default async function SessionsPage() {
  const { supabase, profile } = await requirePageAuth();
  const isAdmin = profile.role === "admin";

  const [sessionsRes, seasonsRes, catsRes, testsRes] = await Promise.all([
    supabase
      .from("assessment_sessions")
      .select(
        "*, season:seasons(*), categories:session_categories(category:assessment_categories(*)), tests:session_tests(sort_order, test:assessment_tests(*))",
      )
      .order("session_date", { ascending: false }),
    supabase.from("seasons").select("*").order("label", { ascending: false }),
    supabase.from("assessment_categories").select("*").order("sort_order"),
    supabase.from("assessment_tests").select("*").order("sort_order"),
  ]);

  const normalized = ((sessionsRes.data ?? []) as unknown as Record<
    string,
    unknown
  >[]).map((s) => ({
    ...s,
    season: Array.isArray(s.season) ? s.season[0] : s.season,
    categories: Array.isArray(s.categories)
      ? s.categories.map((c: Record<string, unknown>) => ({
          category: Array.isArray(c.category) ? c.category[0] : c.category,
        }))
      : [],
    tests: Array.isArray(s.tests)
      ? s.tests.map((t: Record<string, unknown>) => ({
          sort_order: Number(t.sort_order ?? 0),
          test: Array.isArray(t.test) ? t.test[0] : t.test,
        }))
      : [],
  })) as unknown as (AssessmentSession & {
    season?: Season | null;
    categories?: { category: AssessmentCategory }[];
    tests?: { sort_order: number; test: AssessmentTest }[];
  })[];

  return (
    <SessionsListClient
      sessions={normalized}
      seasons={(seasonsRes.data ?? []) as Season[]}
      categories={(catsRes.data ?? []) as AssessmentCategory[]}
      tests={(testsRes.data ?? []) as AssessmentTest[]}
      isAdmin={isAdmin}
    />
  );
}
