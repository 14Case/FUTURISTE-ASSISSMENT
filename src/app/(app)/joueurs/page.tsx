import { requirePageAuth } from "@/lib/auth/guards";
import { PlayersManager } from "@/components/players/players-manager";
import type { AssessmentCategory, PlayerWithRelations } from "@/lib/types/database";

export default async function JoueursPage() {
  const { supabase, profile } = await requirePageAuth();
  const isAdmin = profile.role === "admin";

  const selectCols = isAdmin
    ? "*, category:assessment_categories(*), guardians:player_guardians(relationship, is_primary, guardian:guardians(*))"
    : "*, category:assessment_categories(*)";

  const [playersRes, categoriesRes, settingsRes] = await Promise.all([
    supabase.from("players").select(selectCols).order("last_name"),
    supabase.from("assessment_categories").select("*").order("sort_order"),
    supabase
      .from("club_settings")
      .select("sex_field_enabled")
      .eq("id", 1)
      .maybeSingle(),
  ]);

  const normalizedPlayers = ((playersRes.data ?? []) as unknown as Record<
    string,
    unknown
  >[]).map((p) => ({
    ...p,
    category: Array.isArray(p.category) ? p.category[0] : p.category,
    guardians: Array.isArray(p.guardians)
      ? p.guardians.map((g: Record<string, unknown>) => ({
          ...g,
          guardian: Array.isArray(g.guardian) ? g.guardian[0] : g.guardian,
        }))
      : [],
  })) as unknown as PlayerWithRelations[];

  return (
    <PlayersManager
      initialPlayers={normalizedPlayers}
      categories={(categoriesRes.data ?? []) as AssessmentCategory[]}
      isAdmin={isAdmin}
      sexFieldEnabled={settingsRes.data?.sex_field_enabled ?? true}
    />
  );
}
