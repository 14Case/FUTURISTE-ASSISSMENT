import { NextResponse, type NextRequest } from "next/server";
import { requireApiAdmin, requireApiAuth } from "@/lib/auth/guards";
import { playerInputSchema, uuidSchema } from "@/lib/validation/schemas";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiAuth();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) {
    return NextResponse.json({ error: "Identifiant invalide." }, { status: 400 });
  }

  const isAdmin = auth.ctx.profile.role === "admin";
  const selectCols = isAdmin
    ? "*, category:assessment_categories(*), guardians:player_guardians(relationship, is_primary, guardian:guardians(*))"
    : "*, category:assessment_categories(*)";

  const { data: player, error } = await auth.ctx.supabase
    .from("players")
    .select(selectCols)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!player) {
    return NextResponse.json(
      { error: "Joueur introuvable ou accès non autorisé." },
      { status: 404 },
    );
  }

  return NextResponse.json({ player });
}

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

  // Archivage / réactivation rapide
  if (
    body &&
    typeof body === "object" &&
    Object.keys(body).length === 1 &&
    typeof body.status === "string"
  ) {
    if (!["active", "inactive", "archived"].includes(body.status)) {
      return NextResponse.json({ error: "Statut invalide." }, { status: 400 });
    }
    const { data, error } = await supabase
      .from("players")
      .update({
        status: body.status,
        archived_at: body.status === "archived" ? new Date().toISOString() : null,
      })
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ player: data });
  }

  const parsed = playerInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Données invalides." },
      { status: 400 },
    );
  }

  const { guardians, player_number, ...fields } = parsed.data;
  const updateData: Record<string, unknown> = {
    ...fields,
    archived_at: fields.status === "archived" ? new Date().toISOString() : null,
  };
  if (player_number) {
    updateData.player_number = player_number;
  }

  const { data: updated, error: updErr } = await supabase
    .from("players")
    .update(updateData)
    .eq("id", id)
    .select("*")
    .single();

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 400 });
  }

  // Synchroniser les responsables légaux
  await supabase.from("player_guardians").delete().eq("player_id", id);
  for (const g of guardians) {
    let guardianId = g.id ?? null;
    if (guardianId) {
      await supabase
        .from("guardians")
        .update({
          last_name: g.last_name,
          first_name: g.first_name ?? null,
          phone: g.phone,
          whatsapp: g.whatsapp ?? null,
          email: g.email ?? null,
        })
        .eq("id", guardianId);
    } else {
      const { data: existing } = await supabase
        .from("guardians")
        .select("id")
        .eq("phone", g.phone)
        .ilike("last_name", g.last_name)
        .maybeSingle();
      if (existing) {
        guardianId = existing.id;
      } else {
        const { data: createdG, error: gErr } = await supabase
          .from("guardians")
          .insert({
            last_name: g.last_name,
            first_name: g.first_name ?? null,
            phone: g.phone,
            whatsapp: g.whatsapp ?? null,
            email: g.email ?? null,
          })
          .select("id")
          .single();
        if (gErr) {
          return NextResponse.json({ error: gErr.message }, { status: 400 });
        }
        guardianId = createdG.id;
      }
    }

    await supabase.from("player_guardians").insert({
      player_id: id,
      guardian_id: guardianId,
      relationship: g.relationship ?? null,
      is_primary: g.is_primary,
    });
  }

  return NextResponse.json({ player: updated });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) {
    return NextResponse.json({ error: "Identifiant invalide." }, { status: 400 });
  }

  // Conformité historique : si le joueur possède des évaluations, on refuse la suppression
  // destructrice et on invite à archiver, sauf s'il n'a aucun historique.
  const { count } = await auth.ctx.supabase
    .from("session_players")
    .select("id", { count: "exact", head: true })
    .eq("player_id", id);

  if ((count ?? 0) > 0) {
    return NextResponse.json(
      {
        error:
          "Ce joueur possède un historique de sessions : utilisez l'archivage pour préserver l'intégrité des évaluations.",
      },
      { status: 409 },
    );
  }

  const { error } = await auth.ctx.supabase.from("players").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
