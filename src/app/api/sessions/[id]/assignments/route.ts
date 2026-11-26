import { NextResponse, type NextRequest } from "next/server";
import { requireApiAdmin } from "@/lib/auth/guards";
import { sessionAssignmentInputSchema, uuidSchema } from "@/lib/validation/schemas";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiAdmin();
  if (!auth.ok) return auth.response;

  const { id: sessionId } = await params;
  if (!uuidSchema.safeParse(sessionId).success) {
    return NextResponse.json({ error: "Identifiant invalide." }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = sessionAssignmentInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Affectation invalide." },
      { status: 400 },
    );
  }

  const { data, error } = await auth.ctx.supabase
    .from("session_assignments")
    .insert({
      session_id: sessionId,
      user_id: parsed.data.user_id,
      test_id: parsed.data.test_id ?? null,
      category_id: parsed.data.category_id ?? null,
    })
    .select("*, user:profiles(id, full_name, email, role)")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ assignment: data }, { status: 201 });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiAdmin();
  if (!auth.ok) return auth.response;

  const { id: sessionId } = await params;
  const assignmentId = request.nextUrl.searchParams.get("assignment_id") ?? "";
  if (
    !uuidSchema.safeParse(sessionId).success ||
    !uuidSchema.safeParse(assignmentId).success
  ) {
    return NextResponse.json({ error: "Identifiants invalides." }, { status: 400 });
  }

  const { error } = await auth.ctx.supabase
    .from("session_assignments")
    .delete()
    .eq("id", assignmentId)
    .eq("session_id", sessionId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
