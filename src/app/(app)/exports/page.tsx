import Link from "next/link";
import { Download, Upload, FileArchive, Code2 } from "lucide-react";
import { requirePageAdmin } from "@/lib/auth/guards";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default async function ExportsPage() {
  const { supabase } = await requirePageAdmin();

  const { data: sessions } = await supabase
    .from("assessment_sessions")
    .select("id, name, session_date")
    .order("session_date", { ascending: false });

  const latestSessionId = sessions?.[0]?.id ?? "";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white">
          Exports CSV, Rapports & Intégration Future
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Extractions structurées compatibles Excel (UTF-8 avec BOM) et architecture
          prête pour FUTURISTE FC MANAGEMENT.
        </p>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        <ExportTile
          title="Export CSV des Joueurs"
          description="Identité complète, UUID stable, catégorie, poste, pied dominant, responsable légal principal et statut de consentement."
          href="/api/exports/joueurs"
          cta="Télécharger les joueurs (.csv)"
        />
        <ExportTile
          title="Export CSV des Sessions"
          description="Calendrier des sessions d'évaluation, saisons, lieux, statuts et dates de finalisation."
          href="/api/exports/sessions"
          cta="Télécharger les sessions (.csv)"
        />
        <ExportTile
          title="Export CSV des Résultats"
          description="Toutes les évaluations terrain atelier par atelier, scores retenus, statuts et commentaires."
          href="/api/exports/resultats"
          cta="Télécharger les résultats (.csv)"
        />
        <ExportTile
          title="Export CSV des Classements"
          description="Scores consolidés sur 100 et par domaine pour la session la plus récente."
          href={
            latestSessionId
              ? `/api/exports/classements?session_id=${latestSessionId}`
              : "/api/exports/classements"
          }
          cta="Télécharger le classement (.csv)"
        />
        <Card className="p-5 flex flex-col justify-between">
          <div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 text-sky-900 mb-3">
              <FileArchive className="h-5 w-5" />
            </div>
            <h3 className="font-bold text-slate-900 dark:text-white">
              Archive ZIP des Rapports PDF
            </h3>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
              Générez et téléchargez en une archive ZIP l&apos;ensemble des rapports PDF
              individuels d&apos;une session.
            </p>
          </div>
          <Link
            href="/rapports"
            className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl bg-violet-800 px-4 py-2.5 text-xs font-bold text-white hover:bg-violet-900"
          >
            Ouvrir le Centre des Rapports →
          </Link>
        </Card>
        <Card className="p-5 flex flex-col justify-between">
          <div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-900 mb-3">
              <Upload className="h-5 w-5" />
            </div>
            <h3 className="font-bold text-slate-900 dark:text-white">
              Importation CSV / Excel
            </h3>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
              Assistant d&apos;import avec prévisualisation, détection des doublons et
              rapport d&apos;erreurs téléchargeable.
            </p>
          </div>
          <Link
            href="/joueurs/importer"
            className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-xs font-bold text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-100"
          >
            Ouvrir l&apos;importateur →
          </Link>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Code2 className="h-5 w-5 text-violet-700" />
            <span>Points d&apos;API pour l&apos;intégration FUTURISTE FC MANAGEMENT</span>
          </CardTitle>
          <CardDescription>
            Identifiants UUID v4 stables et champ <code>players.external_ref</code>{" "}
            prévus pour le couplage avec le futur progiciel de gestion de l&apos;académie.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 gap-2.5 text-xs font-mono">
            <div className="rounded-xl bg-slate-50 p-3 border border-slate-200 dark:bg-slate-950 dark:border-slate-800">
              <strong>GET /api/players</strong> — Liste et fiches joueurs + tuteurs
            </div>
            <div className="rounded-xl bg-slate-50 p-3 border border-slate-200 dark:bg-slate-950 dark:border-slate-800">
              <strong>GET /api/sessions</strong> — Sessions, catégories & ateliers
            </div>
            <div className="rounded-xl bg-slate-50 p-3 border border-slate-200 dark:bg-slate-950 dark:border-slate-800">
              <strong>GET /api/evaluations?session_id=...</strong> — Tentatives & scores bruts
            </div>
            <div className="rounded-xl bg-slate-50 p-3 border border-slate-200 dark:bg-slate-950 dark:border-slate-800">
              <strong>GET /api/scores?session_id=...</strong> — Scores consolidés & profils
            </div>
            <div className="rounded-xl bg-slate-50 p-3 border border-slate-200 dark:bg-slate-950 dark:border-slate-800 sm:col-span-2">
              <strong>GET /api/reports?player_id=...</strong> — Métadonnées des rapports PDF générés
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ExportTile({
  title,
  description,
  href,
  cta,
}: {
  title: string;
  description: string;
  href: string;
  cta: string;
}) {
  return (
    <Card className="p-5 flex flex-col justify-between">
      <div>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 text-violet-800 mb-3">
          <Download className="h-5 w-5" />
        </div>
        <h3 className="font-bold text-slate-900 dark:text-white">{title}</h3>
        <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
          {description}
        </p>
      </div>
      <a
        href={href}
        className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl bg-violet-800 px-4 py-2.5 text-xs font-bold text-white hover:bg-violet-900"
      >
        <Download className="h-3.5 w-3.5" />
        <span>{cta}</span>
      </a>
    </Card>
  );
}
