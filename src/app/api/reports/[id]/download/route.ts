import { NextResponse, type NextRequest } from "next/server";
import { requireApiAdmin } from "@/lib/auth/guards";
import { uuidSchema } from "@/lib/validation/schemas";

/**
 * Téléchargement / prévisualisation sécurisée d'un rapport PDF depuis l'espace
 * privé Supabase Storage (`reports`). Aucun lien public permanent n'est exposé.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) {
    return NextResponse.json({ error: "Identifiant invalide." }, { status: 400 });
  }

  const inline = request.nextUrl.searchParams.get("inline") === "1";
  const signedOnly = request.nextUrl.searchParams.get("signed") === "1";
  const supabase = auth.ctx.supabase;

  const { data: report, error } = await supabase
    .from("assessment_reports")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !report) {
    return NextResponse.json({ error: "Rapport introuvable." }, { status: 404 });
  }

  // Option URL signée temporaire (durée stricte de 120 secondes)
  if (signedOnly) {
    const { data: signed, error: signErr } = await supabase.storage
      .from("reports")
      .createSignedUrl(report.storage_path, 120, {
        download: inline ? false : report.file_name,
      });

    if (signErr || !signed?.signedUrl) {
      return NextResponse.json(
        { error: signErr?.message ?? "Impossible de générer l'URL temporaire." },
        { status: 500 },
      );
    }
    return NextResponse.json({
      signed_url: signed.signedUrl,
      expires_in_seconds: 120,
      file_name: report.file_name,
    });
  }

  const { data: blob, error: dlErr } = await supabase.storage
    .from("reports")
    .download(report.storage_path);

  if (dlErr || !blob) {
    return NextResponse.json(
      { error: dlErr?.message ?? "Fichier PDF introuvable dans le stockage privé." },
      { status: 404 },
    );
  }

  const arrayBuffer = await blob.arrayBuffer();
  const disposition = inline
    ? `inline; filename="${report.file_name}"`
    : `attachment; filename="${report.file_name}"`;

  return new NextResponse(arrayBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": disposition,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
