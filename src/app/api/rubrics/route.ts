import { NextResponse, type NextRequest } from "next/server";
import { requireApiAdmin, requireApiAuth } from "@/lib/auth/guards";
import { validateRubricConfig } from "@/lib/scoring/engine";
import { rubricVersionInputSchema } from "@/lib/validation/schemas";

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth();
  if (!auth.ok) return auth.response;

  const testId = request.nextUrl.searchParams.get("test_id");
  let query = auth.ctx.supabase
    .from("rubric_versions")
    .select("*, test:assessment_tests(*), category:assessment_categories(*)")
    .order("test_id")
    .order("version", { ascending: false });

  if (testId) {
    query = query.eq("test_id", testId);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ rubrics: data ?? [] });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAdmin();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = rubricVersionInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Barème invalide." },
      { status: 400 },
    );
  }

  const supabase = auth.ctx.supabase;
  const payload = parsed.data;

  const { data: test } = await supabase
    .from("assessment_tests")
    .select("id, max_points")
    .eq("id", payload.test_id)
    .maybeSingle();

  if (!test) {
    return NextResponse.json({ error: "Atelier introuvable." }, { status: 404 });
  }

  // Vérification de cohérence mathématique avant enregistrement
  const configIssues = validateRubricConfig(payload.config, Number(test.max_points)).filter(
    (i) => i.code === "invalid_config",
  );
  if (configIssues.length > 0) {
    return NextResponse.json(
      {
        error: configIssues.map((i) => i.message).join(" "),
        issues: configIssues,
      },
      { status: 400 },
    );
  }

  // Calcul du prochain numéro de version pour le triplet (test, catégorie, sexe)
  let versionQuery = supabase
    .from("rubric_versions")
    .select("id, version, status")
    .eq("test_id", payload.test_id);
  versionQuery = payload.category_id
    ? versionQuery.eq("category_id", payload.category_id)
    : versionQuery.is("category_id", null);
  versionQuery = payload.sex
    ? versionQuery.eq("sex", payload.sex)
    : versionQuery.is("sex", null);

  const { data: existingVersions } = await versionQuery;
  const maxVersion = (existingVersions ?? []).reduce(
    (acc, v) => Math.max(acc, v.version),
    0,
  );

  // Si la nouvelle version est publiée active, archiver l'ancienne version active de même portée
  if (payload.status === "active") {
    const activeIds = (existingVersions ?? [])
      .filter((v) => v.status === "active")
      .map((v) => v.id);
    if (activeIds.length > 0) {
      await supabase
        .from("rubric_versions")
        .update({ status: "archived" })
        .in("id", activeIds);
    }
  }

  const { data: created, error } = await supabase
    .from("rubric_versions")
    .insert({
      test_id: payload.test_id,
      category_id: payload.category_id ?? null,
      sex: payload.sex ?? null,
      version: maxVersion + 1,
      status: payload.status,
      effective_from: payload.effective_from,
      config: payload.config,
      notes: payload.notes ?? null,
      created_by: auth.ctx.profile.id,
      activated_at: payload.status === "active" ? new Date().toISOString() : null,
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ rubric: created }, { status: 201 });
}
