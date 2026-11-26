import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { bootstrapAdminSchema } from "@/lib/validation/schemas";

/**
 * Vérifie si l'application possède déjà au moins un compte administrateur.
 * Dès qu'un administrateur existe, l'amorçage initial est définitivement verrouillé.
 */
export async function GET() {
  if (!isSupabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({
      configured: isSupabaseConfigured(),
      service_role_configured: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      needs_bootstrap: false,
      secret_required: Boolean(process.env.BOOTSTRAP_ADMIN_SECRET),
    });
  }

  const admin = createSupabaseAdminClient();
  const { count, error } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "admin");

  if (error) {
    return NextResponse.json(
      {
        configured: true,
        service_role_configured: true,
        needs_bootstrap: false,
        db_error:
          "Les tables Supabase ne semblent pas encore créées. Exécutez d'abord les migrations SQL.",
      },
      { status: 200 },
    );
  }

  return NextResponse.json({
    configured: true,
    service_role_configured: true,
    needs_bootstrap: (count ?? 0) === 0,
    secret_required: Boolean(process.env.BOOTSTRAP_ADMIN_SECRET),
  });
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      {
        error:
          "Variables Supabase (dont SUPABASE_SERVICE_ROLE_KEY) requises pour créer le premier administrateur.",
      },
      { status: 503 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = bootstrapAdminSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Données invalides." },
      { status: 400 },
    );
  }

  const expectedSecret = process.env.BOOTSTRAP_ADMIN_SECRET;
  if (expectedSecret && parsed.data.secret !== expectedSecret) {
    return NextResponse.json(
      { error: "Jeton d'amorçage (BOOTSTRAP_ADMIN_SECRET) invalide." },
      { status: 403 },
    );
  }

  const admin = createSupabaseAdminClient();
  const { count, error: countErr } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "admin");

  if (countErr) {
    return NextResponse.json(
      { error: `Erreur base de données : ${countErr.message}` },
      { status: 500 },
    );
  }

  if ((count ?? 0) > 0) {
    return NextResponse.json(
      {
        error:
          "Un compte administrateur existe déjà. Connectez-vous avec ce compte pour gérer les utilisateurs.",
      },
      { status: 403 },
    );
  }

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: { full_name: parsed.data.full_name },
  });

  if (createErr || !created.user) {
    return NextResponse.json(
      { error: createErr?.message ?? "Impossible de créer le compte Auth." },
      { status: 400 },
    );
  }

  const { error: profileErr } = await admin
    .from("profiles")
    .upsert({
      id: created.user.id,
      full_name: parsed.data.full_name,
      email: parsed.data.email,
      role: "admin",
      is_active: true,
    });

  if (profileErr) {
    return NextResponse.json({ error: profileErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    user_id: created.user.id,
  });
}
