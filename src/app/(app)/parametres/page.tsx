import { requirePageAdmin } from "@/lib/auth/guards";
import { SettingsClient } from "@/components/admin/settings-client";
import type {
  AssessmentCategory,
  ClubSettings,
  Season,
} from "@/lib/types/database";

export default async function ParametresPage() {
  const { supabase } = await requirePageAdmin();

  const [settingsRes, seasonsRes, catsRes, demoCountRes] = await Promise.all([
    supabase.from("club_settings").select("*").eq("id", 1).maybeSingle(),
    supabase.from("seasons").select("*").order("label", { ascending: false }),
    supabase.from("assessment_categories").select("*").order("sort_order"),
    supabase
      .from("players")
      .select("id", { count: "exact", head: true })
      .eq("is_demo", true),
  ]);

  return (
    <SettingsClient
      settings={(settingsRes.data as ClubSettings | null) ?? null}
      seasons={(seasonsRes.data ?? []) as Season[]}
      categories={(catsRes.data ?? []) as AssessmentCategory[]}
      demoPlayersCount={demoCountRes.count ?? 0}
    />
  );
}
