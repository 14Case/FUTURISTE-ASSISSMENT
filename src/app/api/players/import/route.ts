import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/auth/guards";
import { playerImportBatchSchema } from "@/lib/validation/schemas";
import { playerDuplicateKey } from "@/lib/utils";

export async function POST(request: Request) {
  const auth = await requireApiAdmin();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = playerImportBatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          parsed.error.issues[0]?.message ??
          "Le lot d'importation contient des données invalides.",
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  const supabase = auth.ctx.supabase;
  const { data: existingPlayers } = await supabase
    .from("players")
    .select("last_name, first_name, birth_date");

  const existingKeys = new Set(
    (existingPlayers ?? []).map((p) =>
      playerDuplicateKey(p.last_name, p.first_name, p.birth_date),
    ),
  );

  let imported = 0;
  let skippedDuplicates = 0;
  const errors: { index: number; name: string; error: string }[] = [];

  for (let i = 0; i < parsed.data.rows.length; i++) {
    const row = parsed.data.rows[i];
    const key = playerDuplicateKey(row.last_name, row.first_name, row.birth_date);

    if (existingKeys.has(key)) {
      if (parsed.data.skip_duplicates) {
        skippedDuplicates += 1;
        continue;
      }
      errors.push({
        index: i + 1,
        name: `${row.last_name} ${row.first_name}`,
        error: "Doublon déjà présent en base.",
      });
      continue;
    }

    const { guardians, player_number, ...fields } = row;
    const insertData: Record<string, unknown> = {
      ...fields,
      consent_date:
        row.consent_obtained && !row.consent_date
          ? new Date().toISOString().slice(0, 10)
          : (row.consent_date ?? null),
      created_by: auth.ctx.profile.id,
    };
    if (player_number) insertData.player_number = player_number;

    const { data: created, error: pErr } = await supabase
      .from("players")
      .insert(insertData)
      .select("id")
      .single();

    if (pErr || !created) {
      errors.push({
        index: i + 1,
        name: `${row.last_name} ${row.first_name}`,
        error: pErr?.message ?? "Échec d'insertion.",
      });
      continue;
    }

    existingKeys.add(key);
    imported += 1;

    for (const g of guardians) {
      const { data: exG } = await supabase
        .from("guardians")
        .select("id")
        .eq("phone", g.phone)
        .ilike("last_name", g.last_name)
        .maybeSingle();

      let gId = exG?.id ?? null;
      if (!gId) {
        const { data: newG } = await supabase
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
        gId = newG?.id ?? null;
      }
      if (gId) {
        await supabase.from("player_guardians").upsert({
          player_id: created.id,
          guardian_id: gId,
          relationship: g.relationship ?? null,
          is_primary: g.is_primary,
        });
      }
    }
  }

  return NextResponse.json({
    imported,
    skipped_duplicates: skippedDuplicates,
    errors,
  });
}
