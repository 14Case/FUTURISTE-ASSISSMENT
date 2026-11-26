import { requirePageAdmin } from "@/lib/auth/guards";
import { UsersAdminClient } from "@/components/admin/users-admin-client";
import type { Profile } from "@/lib/types/database";

export default async function EncadreursPage() {
  const { supabase, profile } = await requirePageAdmin();

  const { data: users } = await supabase
    .from("profiles")
    .select("*")
    .order("role")
    .order("full_name");

  return (
    <UsersAdminClient
      users={(users ?? []) as Profile[]}
      currentUserId={profile.id}
    />
  );
}
