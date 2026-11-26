import { requirePageAdmin } from "@/lib/auth/guards";
import { ImportWizard } from "@/components/players/import-wizard";
import { playerDuplicateKey } from "@/lib/utils";
import type { AssessmentCategory } from "@/lib/types/database";

export default async function ImporterJoueursPage() {
  const { supabase } = await requirePageAdmin();

  const [catsRes, playersRes] = await Promise.all([
    supabase.from("assessment_categories").select("*").order("sort_order"),
    supabase.from("players").select("last_name, first_name, birth_date"),
  ]);

  const existingKeys = (playersRes.data ?? []).map((p) =>
    playerDuplicateKey(p.last_name, p.first_name, p.birth_date),
  );

  return (
    <ImportWizard
      categories={(catsRes.data ?? []) as AssessmentCategory[]}
      existingDuplicateKeys={existingKeys}
    />
  );
}
