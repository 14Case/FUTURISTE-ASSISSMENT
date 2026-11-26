import { requirePageAuth } from "@/lib/auth/guards";
import { FieldEntryClient } from "@/components/field/field-entry-client";

export default async function TerrainPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { supabase, profile } = await requirePageAuth();
  const sp = await searchParams;

  const { data: sessions } = await supabase
    .from("assessment_sessions")
    .select("id, name, session_date, status")
    .neq("status", "archived")
    .order("session_date", { ascending: false });

  const list = sessions ?? [];
  const preferredSession =
    (sp.session_id && list.some((s) => s.id === sp.session_id)
      ? sp.session_id
      : null) ??
    list.find((s) => s.status === "in_progress")?.id ??
    list[0]?.id ??
    "";

  return (
    <FieldEntryClient
      initialSessions={list}
      initialSessionId={preferredSession}
      currentUserId={profile.id}
      isAdmin={profile.role === "admin"}
    />
  );
}
