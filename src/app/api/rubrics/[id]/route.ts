import { NextResponse, type NextRequest } from "next/server";
import { requireApiAdmin } from "@/lib/auth/guards";
import { validateRubricConfig } from "@/lib/scoring/engine";
import { rubricConfigSchema, uuidSchema } from "@/lib/validation/schemas";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) {
    return NextResponse.json({ error: "Identifiant invalide." }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const supabase = auth.ctx.supabase;

  const { data: current, error: fetchErr } = await supabase
    .from("rubric_versions")
    .select("*, test:assessment_tests(max_points)")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr || !current) {
    return NextResponse.json({ error: "Version de barème introuvable." }, { status: 404 });
  }

  // Modification de la configuration d'un brouillon
  if (body?.config) {
    if (current.status !== "draft") {
      return NextResponse.json(
        {
          error:
            "Un barème publié est immuable afin de protéger l'historique : créez une nouvelle version.",
        },
        { status: 409 },
      );
    }
    const parsedCfg = rubricConfigSchema.safeParse(body.config);
    if (!parsedCfg.success) {
      return NextResponse.json(
        { error: parsedCfg.error.issues[0]?.message ?? "Configuration invalide." },
        { status: 400 },
      );
    }
    const testMax = Number(
      (Array.isArray(current.test) ? current.test[0] : current.test)?.max_points ?? 0,
    );
    const issues = validateRubricConfig(parsedCfg.data, testMax).filter(
      (i) => i.code === "invalid_config",
    );
    if (issues.length > 0) {
      return NextResponse.json(
        { error: issues.map((i) => i.message).join(" ") },
        { status: 400 },
      );
    }

    const { data, error } = await supabase
      .from("rubric_versions")
      .update({
        config: parsedCfg.data,
        notes: typeof body.notes === "string" ? body.notes : current.notes,
      })
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ rubric: data });
  }

  // Changement de statut (draft -> active ou active -> archived)
  if (body?.status === "active" || body?.status === "archived") {
    if (body.status === "active") {
      let q = supabase
        .from("rubric_versions")
        .update({ status: "archived" })
        .eq("test_id", current.test_id)
        .eq("status", "active")
        .neq("id", id);
      q = current.category_id
        ? q.eq("category_id", current.category_id)
        : q.is("category_id", null);
      q = current.sex ? q.eq("sex", current.sex) : q.is("sex", null);
      await q;
    }

    const { data, error } = await supabase
      .from("rubric_versions")
      .update({ status: body.status })
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ rubric: data });
  }

  return NextResponse.json({ error: "Aucune modification valide fournie." }, { status: 400 });
}
