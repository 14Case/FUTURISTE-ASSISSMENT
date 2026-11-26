import { NextResponse, type NextRequest } from "next/server";
import { requireApiAdmin } from "@/lib/auth/guards";
import { uuidSchema } from "@/lib/validation/schemas";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) {
    return NextResponse.json({ error: "Identifiant invalide." }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const supabase = auth.ctx.supabase;

  const [sessRes, catsRes, testsRes] = await Promise.all([
    supabase.from("assessment_sessions").select("*").eq("id", id).single(),
    supabase.from("session_categories").select("category_id").eq("session_id", id),
    supabase
      .from("session_tests")
      .select("test_id, sort_order")
      .eq("session_id", id)
      .order("sort_order"),
  ]);

  if (sessRes.error || !sessRes.data) {
    return NextResponse.json({ error: "Session source introuvable." }, { status: 404 });
  }

  const src = sessRes.data;
  const newName =
    typeof body.name === "string" && body.name.trim().length >= 3
      ? body.name.trim()
      : `${src.name} (Copie)`;
  const newDate =
    typeof body.session_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.session_date)
      ? body.session_date
      : src.session_date;

  const { data: created, error: createErr } = await supabase
    .from("assessment_sessions")
    .insert({
      name: newName,
      description: src.description,
      session_date: newDate,
      start_time: src.start_time,
      location: src.location,
      season_id: src.season_id,
      status: "draft",
      is_demo: src.is_demo,
      created_by: auth.ctx.profile.id,
    })
    .select("*")
    .single();

  if (createErr || !created) {
    return NextResponse.json(
      { error: createErr?.message ?? "Duplication impossible." },
      { status: 400 },
    );
  }

  if ((catsRes.data ?? []).length > 0) {
    await supabase.from("session_categories").insert(
      (catsRes.data ?? []).map((c) => ({
        session_id: created.id,
        category_id: c.category_id,
      })),
    );
  }
  if ((testsRes.data ?? []).length > 0) {
    await supabase.from("session_tests").insert(
      (testsRes.data ?? []).map((t) => ({
        session_id: created.id,
        test_id: t.test_id,
        sort_order: t.sort_order,
      })),
    );
  }

  return NextResponse.json({ session: created }, { status: 201 });
}
