import { requirePageAdmin } from "@/lib/auth/guards";
import { RubricsAdminClient } from "@/components/rubrics/rubrics-admin-client";
import type {
  AssessmentCategory,
  AssessmentDomain,
  AssessmentTest,
  RubricVersion,
  TestAgeRule,
} from "@/lib/types/database";

export default async function BaremesPage() {
  const { supabase } = await requirePageAdmin();

  const [domainsRes, testsRes, catsRes, rulesRes, rubricsRes] =
    await Promise.all([
      supabase.from("assessment_domains").select("*").order("sort_order"),
      supabase.from("assessment_tests").select("*").order("sort_order"),
      supabase.from("assessment_categories").select("*").order("sort_order"),
      supabase.from("test_age_rules").select("*"),
      supabase
        .from("rubric_versions")
        .select("*")
        .order("version", { ascending: false }),
    ]);

  return (
    <RubricsAdminClient
      domains={(domainsRes.data ?? []) as AssessmentDomain[]}
      tests={(testsRes.data ?? []) as AssessmentTest[]}
      categories={(catsRes.data ?? []) as AssessmentCategory[]}
      ageRules={(rulesRes.data ?? []) as TestAgeRule[]}
      rubrics={(rubricsRes.data ?? []) as RubricVersion[]}
    />
  );
}
