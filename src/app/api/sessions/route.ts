import { NextResponse } from "next/server";
import { requireApiAdmin, requireApiAuth } from "@/lib/auth/guards";
import { sessionInputSchema } from "@/lib/validation/schemas";

export async function GET() {
  const auth = await requireApiAuth();
  if (!auth.ok) return auth.response;

  const { data, error } = await auth.ctx.supabase
    .from("assessment_sessions")
    .select(
      "*, season:seasons(*), categories:session_categories(category:assessment_categories(*)), tests:session_tests(sort_order, test:assessment_tests(*))",
    )
    .order("session_date", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ sessions: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireApiAdmin();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = sessionInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Données de session invalides." },
      { status: 400 },
    );
  }

  const supabase = auth.ctx.supabase;
  const { category_ids, test_ids, ...restFields } = parsed.data;
  delete (restFields as Record<string, unknown>).reason;

  const { data: session, error: sessErr } = await supabase
    .from("assessment_sessions")
    .insert({
      ...restFields,
      status: "draft",
      created_by: auth.ctx.profile.id,
    })
    .select("*")
    .single();

  if (sessErr || !session) {
    return NextResponse.json(
      { error: sessErr?.message ?? "Impossible de créer la session." },
      { status: 400 },
    );
  }

  await supabase.from("session_categories").insert(
    category_ids.map((category_id) => ({
      session_id: session.id,
      category_id,
    })),
  );

  await supabase.from("session_tests").insert(
    test_ids.map((test_id, idx) => ({
      session_id: session.id,
      test_id,
      sort_order: idx + 1,
    })),
  );

  return NextResponse.json({ session }, { status: 201 });
}
