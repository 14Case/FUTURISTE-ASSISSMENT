import { zipSync } from "fflate";
import { NextResponse, type NextRequest } from "next/server";
import { requireApiAdmin } from "@/lib/auth/guards";
import { uuidSchema } from "@/lib/validation/schemas";

/**
 * Exporte une archive ZIP contenant l'ensemble des rapports PDF actifs d'une session.
 */
export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin();
  if (!auth.ok) return auth.response;

  const sessionId = request.nextUrl.searchParams.get("session_id") ?? "";
  if (!uuidSchema.safeParse(sessionId).success) {
    return NextResponse.json({ error: "Identifiant de session requis." }, { status: 400 });
  }

  const supabase = auth.ctx.supabase;
  const { data: reports, error } = await supabase
    .from("assessment_reports")
    .select("*")
    .eq("session_id", sessionId)
    .neq("status", "archived");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!reports || reports.length === 0) {
    return NextResponse.json(
      { error: "Aucun rapport PDF actif à archiver pour cette session." },
      { status: 404 },
    );
  }

  const files: Record<string, Uint8Array> = {};
  for (const r of reports) {
    const { data: blob } = await supabase.storage
      .from("reports")
      .download(r.storage_path);
    if (blob) {
      const buf = new Uint8Array(await blob.arrayBuffer());
      files[r.file_name] = buf;
    }
  }

  const zipped = zipSync(files, { level: 6 });
  const zipName = `FAFC_Rapports_Session_${new Date().toISOString().slice(0, 10)}.zip`;

  return new NextResponse(Buffer.from(zipped), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${zipName}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
