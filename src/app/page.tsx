import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getCurrentProfile } from "@/lib/auth/guards";

export default async function HomePage() {
  if (!isSupabaseConfigured()) {
    redirect("/configuration-requise");
  }
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect("/connexion");
  }
  redirect("/tableau-de-bord");
}
