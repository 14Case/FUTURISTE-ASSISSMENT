import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/auth/guards";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createUserAccountSchema } from "@/lib/validation/schemas";

export async function GET() {
  const auth = await requireApiAdmin();
  if (!auth.ok) return auth.response;

  const { data, error } = await auth.ctx.supabase
    .from("profiles")
    .select("*")
    .order("role")
    .order("full_name");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ users: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireApiAdmin();
  if (!auth.ok) return auth.response;

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      {
        error:
          "SUPABASE_SERVICE_ROLE_KEY non configurée : création directe de comptes encadreurs indisponible.",
      },
      { status: 503 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = createUserAccountSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Données invalides." },
      { status: 400 },
    );
  }

  const adminClient = createSupabaseAdminClient();
  const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: { full_name: parsed.data.full_name },
  });

  if (createErr || !created.user) {
    return NextResponse.json(
      { error: createErr?.message ?? "Création du compte refusée par Supabase Auth." },
      { status: 400 },
    );
  }

  // Mise à jour via le client authentifié de l'admin pour que auth.uid() soit tracé dans audit_logs
  const { data: profile, error: profErr } = await auth.ctx.supabase
    .from("profiles")
    .update({
      full_name: parsed.data.full_name,
      email: parsed.data.email,
      phone: parsed.data.phone ?? null,
      role: parsed.data.role,
      is_active: true,
    })
    .eq("id", created.user.id)
    .select("*")
    .single();

  if (profErr) {
    return NextResponse.json({ error: profErr.message }, { status: 500 });
  }

  return NextResponse.json({ user: profile }, { status: 201 });
}
