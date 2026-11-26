import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getPublicSupabaseEnv } from "./env";

/**
 * Client privilégié (service_role) — STRICTEMENT CÔTÉ SERVEUR.
 *
 * Règle de sécurité (Section 18) :
 * - Ne JAMAIS importer ce module dans un composant client ("server-only" bloque le build).
 * - Utiliser uniquement pour l'API Auth Admin (création des comptes encadreurs)
 *   et l'amorçage initial contrôlé du premier administrateur, APRÈS vérification
 *   explicite des droits de l'appelant.
 * - Pour toutes les lectures/écritures métier ordinaires, utiliser `createSupabaseServerClient()`
 *   afin que les politiques Row Level Security (RLS) PostgreSQL s'appliquent toujours.
 */
export function createSupabaseAdminClient() {
  const { url } = getPublicSupabaseEnv();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey || serviceKey.length < 20) {
    throw new Error(
      "Variable serveur SUPABASE_SERVICE_ROLE_KEY non configurée.",
    );
  }
  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
