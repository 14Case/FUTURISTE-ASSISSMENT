import { NextResponse, type NextRequest } from "next/server";
import { requireApiAdmin, requireApiAuth } from "@/lib/auth/guards";
import { playerInputSchema } from "@/lib/validation/schemas";
import { playerDuplicateKey, suggestCategoryForAge } from "@/lib/utils";
import type { AssessmentCategory } from "@/lib/types/database";

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth();
  if (!auth.ok) return auth.response;

  const { searchParams } = request.nextUrl;
  const search = searchParams.get("q")?.trim().toLowerCase() ?? "";
  const categoryId = searchParams.get("category_id") ?? "";
  const status = searchParams.get("status") ?? "";
  const includeArchived = searchParams.get("include_archived") === "true";

  const isAdmin = auth.ctx.profile.role === "admin";
  const selectColumns = isAdmin
    ? "*, category:assessment_categories(*), guardians:player_guardians(relationship, is_primary, guardian:guardians(*))"
    : "*, category:assessment_categories(*)";

  let query = auth.ctx.supabase
    .from("players")
    .select(selectColumns)
    .order("last_name")
    .order("first_name");

  if (status) {
    query = query.eq("status", status);
  } else if (!includeArchived) {
    query = query.neq("status", "archived");
  }

  if (categoryId) {
    query = query.eq("category_id", categoryId);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let players = (data ?? []) as unknown as Record<string, unknown>[];
  if (search) {
    players = players.filter((p) => {
      const hay = `${p.player_number ?? ""} ${p.last_name ?? ""} ${p.first_name ?? ""} ${p.preferred_position ?? ""}`.toLowerCase();
      return hay.includes(search);
    });
  }

  return NextResponse.json({ players });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAdmin();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const allowDuplicate = Boolean(body?.allow_duplicate);
  const parsed = playerInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Données joueur invalides.",
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  const supabase = auth.ctx.supabase;
  const payload = parsed.data;

  // Détection des doublons (nom + prénom + date de naissance normalisés)
  if (!allowDuplicate) {
    const { data: candidates } = await supabase
      .from("players")
      .select("id, player_number, last_name, first_name, birth_date")
      .eq("birth_date", payload.birth_date);

    const targetKey = playerDuplicateKey(
      payload.last_name,
      payload.first_name,
      payload.birth_date,
    );
    const duplicate = (candidates ?? []).find(
      (c) =>
        playerDuplicateKey(c.last_name, c.first_name, c.birth_date) === targetKey,
    );
    if (duplicate) {
      return NextResponse.json(
        {
          error: `Doublon potentiel détecté : ${duplicate.last_name} ${duplicate.first_name} (${duplicate.player_number}) possède déjà la même identité et date de naissance.`,
          duplicate,
        },
        { status: 409 },
      );
    }
  }

  // Suggestion automatique de catégorie si non renseignée
  let categoryId = payload.category_id ?? null;
  if (!categoryId) {
    const { data: cats } = await supabase
      .from("assessment_categories")
      .select("*")
      .eq("is_active", true);
    categoryId =
      suggestCategoryForAge(
        (cats ?? []) as AssessmentCategory[],
        payload.birth_date,
        new Date().toISOString().slice(0, 10),
      )?.id ?? null;
  }

  const { guardians, player_number, ...playerFields } = payload;
  const insertData: Record<string, unknown> = {
    ...playerFields,
    category_id: categoryId,
    consent_date:
      payload.consent_obtained && !payload.consent_date
        ? new Date().toISOString().slice(0, 10)
        : (payload.consent_date ?? null),
    created_by: auth.ctx.profile.id,
  };
  if (player_number) {
    insertData.player_number = player_number;
  }

  const { data: createdPlayer, error: playerErr } = await supabase
    .from("players")
    .insert(insertData)
    .select("*")
    .single();

  if (playerErr || !createdPlayer) {
    return NextResponse.json(
      { error: playerErr?.message ?? "Erreur lors de la création du joueur." },
      { status: 400 },
    );
  }

  // Rattachement des responsables légaux (réutilise un responsable existant si même téléphone + nom)
  for (const g of guardians) {
    const { data: existingGuardian } = await supabase
      .from("guardians")
      .select("id")
      .eq("phone", g.phone)
      .ilike("last_name", g.last_name)
      .maybeSingle();

    let guardianId = existingGuardian?.id ?? null;
    if (!guardianId) {
      const { data: newG, error: gErr } = await supabase
        .from("guardians")
        .insert({
          last_name: g.last_name,
          first_name: g.first_name ?? null,
          phone: g.phone,
          whatsapp: g.whatsapp ?? null,
          email: g.email ?? null,
          is_demo: Boolean(payload.is_demo),
        })
        .select("id")
        .single();
      if (gErr) {
        return NextResponse.json(
          { error: `Joueur créé, mais erreur responsable légal : ${gErr.message}` },
          { status: 400 },
        );
      }
      guardianId = newG.id;
    }

    await supabase.from("player_guardians").upsert({
      player_id: createdPlayer.id,
      guardian_id: guardianId,
      relationship: g.relationship ?? null,
      is_primary: g.is_primary,
    });
  }

  return NextResponse.json({ player: createdPlayer }, { status: 201 });
}
