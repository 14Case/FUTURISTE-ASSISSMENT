import { NextResponse } from "next/server";
import { requireApiAdmin, requireApiAuth } from "@/lib/auth/guards";
import { ageRuleInputSchema, testInputSchema } from "@/lib/validation/schemas";

export async function GET() {
  const auth = await requireApiAuth();
  if (!auth.ok) return auth.response;

  const [testsRes, rulesRes, domainsRes] = await Promise.all([
    auth.ctx.supabase.from("assessment_tests").select("*").order("sort_order"),
    auth.ctx.supabase.from("test_age_rules").select("*"),
    auth.ctx.supabase.from("assessment_domains").select("*").order("sort_order"),
  ]);

  if (testsRes.error) {
    return NextResponse.json({ error: testsRes.error.message }, { status: 500 });
  }

  return NextResponse.json({
    domains: domainsRes.data ?? [],
    tests: testsRes.data ?? [],
    age_rules: rulesRes.data ?? [],
  });
}

export async function POST(request: Request) {
  const auth = await requireApiAdmin();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);

  // Mise à jour d'un protocole par catégorie (test_age_rules)
  if (body && typeof body === "object" && "protocol" in body && "test_id" in body) {
    const parsedRule = ageRuleInputSchema.safeParse(body);
    if (!parsedRule.success) {
      return NextResponse.json(
        { error: parsedRule.error.issues[0]?.message ?? "Protocole invalide." },
        { status: 400 },
      );
    }
    const { data, error } = await auth.ctx.supabase
      .from("test_age_rules")
      .upsert(parsedRule.data, { onConflict: "test_id,category_id" })
      .select("*")
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ age_rule: data });
  }

  const parsed = testInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Atelier invalide." },
      { status: 400 },
    );
  }

  const { data, error } = await auth.ctx.supabase
    .from("assessment_tests")
    .insert(parsed.data)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ test: data }, { status: 201 });
}
