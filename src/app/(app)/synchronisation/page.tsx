import { requirePageAuth } from "@/lib/auth/guards";
import { SyncCenterClient } from "@/components/offline/sync-center-client";

export default async function SynchronisationPage() {
  const { supabase } = await requirePageAuth();

  const { data: sessions } = await supabase
    .from("assessment_sessions")
    .select("id, name, session_date")
    .neq("status", "archived")
    .order("session_date", { ascending: false });

  return <SyncCenterClient availableSessions={sessions ?? []} />;
}
