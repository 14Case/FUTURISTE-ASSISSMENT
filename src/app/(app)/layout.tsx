import * as React from "react";
import { requirePageAuth } from "@/lib/auth/guards";
import { AppShell } from "@/components/layout/app-shell";

export default async function AuthenticatedAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { supabase, profile } = await requirePageAuth();
  const { data: settings } = await supabase
    .from("club_settings")
    .select("club_name")
    .eq("id", 1)
    .maybeSingle();

  return (
    <AppShell
      profile={profile}
      clubName={settings?.club_name ?? "FUTURISTE ACADÉMIE FC"}
    >
      {children}
    </AppShell>
  );
}
