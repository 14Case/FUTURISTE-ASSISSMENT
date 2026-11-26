import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export async function GET() {
  return NextResponse.json({
    ok: true,
    app: "FUTURISTE ASSESSMENT",
    supabase_configured: isSupabaseConfigured(),
    timestamp: new Date().toISOString(),
  });
}
