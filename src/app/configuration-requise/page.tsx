import Link from "next/link";
import { Database, KeyRound, CheckCircle2, FileCode2 } from "lucide-react";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function ConfigurationRequisePage() {
  const configured = isSupabaseConfigured();

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4 sm:p-8 pitch-grid">
      <div className="w-full max-w-2xl space-y-6">
        <div className="pitch-pattern rounded-3xl p-6 sm:p-8 text-white shadow-lg flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-pdf.png" alt="FAFC" className="h-16 w-16 shrink-0 rounded-full bg-white p-0.5 shadow-md" />
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-sky-300">
              FUTURISTE ACADÉMIE FC
            </p>
            <h1 className="text-2xl font-black tracking-tight mt-0.5">
              FUTURISTE ASSESSMENT
            </h1>
            <p className="text-sm text-white/85 mt-1">
              Connexion au projet Supabase requise pour activer la base de données,
              l&apos;authentification et le stockage privé des rapports.
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5 text-violet-700" />
              <span>Activation en 3 étapes</span>
            </CardTitle>
            <CardDescription>
              Aucune donnée fictive n&apos;est affichée : l&apos;application attend vos
              identifiants Supabase réels.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
              <p className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <FileCode2 className="h-4 w-4 text-violet-700" />
                1. Exécuter les 4 migrations SQL dans Supabase (SQL Editor)
              </p>
              <p className="mt-1 text-slate-600 dark:text-slate-400">
                Dans l&apos;ordre :{" "}
                <code className="text-xs bg-white px-1.5 py-0.5 rounded border">
                  20261125000001_schema.sql
                </code>
                ,{" "}
                <code className="text-xs bg-white px-1.5 py-0.5 rounded border">
                  20261125000002_security.sql
                </code>
                ,{" "}
                <code className="text-xs bg-white px-1.5 py-0.5 rounded border">
                  20261125000003_storage.sql
                </code>{" "}
                et{" "}
                <code className="text-xs bg-white px-1.5 py-0.5 rounded border">
                  20261125000004_reference_data.sql
                </code>
                .
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
              <p className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-violet-700" />
                2. Renseigner le fichier <code>.env.local</code> (ou Vercel Environment Variables)
              </p>
              <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-sky-200">
{`NEXT_PUBLIC_SUPABASE_URL=https://votre-projet.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=votre_cle_anon_publique
SUPABASE_SERVICE_ROLE_KEY=votre_cle_service_role_serveur`}
              </pre>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
              <p className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                3. Créer le premier compte Administrateur
              </p>
              <p className="mt-1 text-slate-600 dark:text-slate-400">
                Redémarrez le serveur puis ouvrez{" "}
                <Link
                  href="/initialisation"
                  className="font-bold text-violet-800 underline"
                >
                  /initialisation
                </Link>{" "}
                pour créer votre compte administrateur FUTURISTE ACADÉMIE FC.
              </p>
            </div>

            {configured ? (
              <div className="pt-2">
                <Link
                  href="/connexion"
                  className="inline-flex w-full items-center justify-center rounded-xl bg-violet-800 px-4 py-3 font-bold text-white hover:bg-violet-900"
                >
                  Supabase détecté — Aller à la connexion
                </Link>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
