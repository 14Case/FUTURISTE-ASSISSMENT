"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { readSheet } from "read-excel-file/browser";
import {
  Download,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import type { AssessmentCategory } from "@/lib/types/database";
import {
  autoMapColumns,
  buildImportErrorReportCsv,
  buildPlayerImportTemplateCsv,
  IMPORT_FIELD_LABELS,
  IMPORT_TEMPLATE_HEADERS,
  validateMappedImportRows,
  type ImportCanonicalField,
} from "@/lib/import-export/csv";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

function triggerDownload(content: string, filename: string, mime = "text/csv;charset=utf-8;") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ImportWizard({
  categories,
  existingDuplicateKeys,
}: {
  categories: AssessmentCategory[];
  existingDuplicateKeys: string[];
}) {
  const router = useRouter();
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [sourceHeaders, setSourceHeaders] = React.useState<string[]>([]);
  const [rawRows, setRawRows] = React.useState<Record<string, unknown>[]>([]);
  const [mapping, setMapping] = React.useState<
    Partial<Record<ImportCanonicalField, string>>
  >({});
  const [skipDuplicates, setSkipDuplicates] = React.useState(true);
  const [importing, setImporting] = React.useState(false);
  const [importDone, setImportDone] = React.useState<{
    imported: number;
    skipped_duplicates: number;
    errors: { index: number; name: string; error: string }[];
  } | null>(null);

  const dupSet = React.useMemo(
    () => new Set(existingDuplicateKeys),
    [existingDuplicateKeys],
  );

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportDone(null);
    setFileName(file.name);

    try {
      if (file.name.toLowerCase().endsWith(".xlsx")) {
        const matrix = await readSheet(file);
        if (matrix.length < 2) {
          toast.error("Le fichier Excel ne contient aucune ligne de données.");
          return;
        }
        const headers = matrix[0].map((c, i) =>
          c !== null && c !== undefined && String(c).trim()
            ? String(c).trim()
            : `Colonne_${i + 1}`,
        );
        const rows = matrix.slice(1).map((r) => {
          const obj: Record<string, unknown> = {};
          headers.forEach((h, idx) => {
            obj[h] = r[idx] ?? "";
          });
          return obj;
        });
        setSourceHeaders(headers);
        setRawRows(rows);
        setMapping(autoMapColumns(headers));
      } else {
        const text = await file.text();
        const parsed = Papa.parse<Record<string, unknown>>(text, {
          header: true,
          skipEmptyLines: true,
        });
        const headers = parsed.meta.fields ?? [];
        setSourceHeaders(headers);
        setRawRows(parsed.data);
        setMapping(autoMapColumns(headers));
      }
    } catch {
      toast.error("Impossible de lire ce fichier. Vérifiez qu'il s'agit d'un CSV ou XLSX valide.");
    }
  };

  const validation = React.useMemo(() => {
    if (rawRows.length === 0) return null;
    return validateMappedImportRows(rawRows, mapping, {
      categories,
      existingDuplicateKeys: dupSet,
    });
  }, [rawRows, mapping, categories, dupSet]);

  const handleConfirmImport = async () => {
    if (!validation) return;
    const validPayloads = validation.rows
      .filter(
        (r) =>
          r.parsed &&
          !r.isDuplicateInFile &&
          (!skipDuplicates || !r.isDuplicateExisting),
      )
      .map((r) => r.parsed!);

    if (validPayloads.length === 0) {
      toast.error("Aucune ligne valide et non dupliquée à importer.");
      return;
    }

    setImporting(true);
    try {
      const res = await fetch("/api/players/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: validPayloads,
          skip_duplicates: skipDuplicates,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body?.error ?? "Échec de l'importation.");
        return;
      }
      setImportDone(body);
      toast.success(`${body.imported} joueur(s) importé(s) avec succès.`);
      router.refresh();
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <Link
            href="/joueurs"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-violet-800 hover:underline mb-1"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Retour à l&apos;effectif</span>
          </Link>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white">
            Importation de joueurs (CSV / Excel)
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Contrôle de validité ligne par ligne, détection des doublons et mappage des
            colonnes avant enregistrement.
          </p>
        </div>

        <Button
          variant="outline"
          onClick={() =>
            triggerDownload(
              buildPlayerImportTemplateCsv(),
              "modele_import_joueurs_FAFC.csv",
            )
          }
        >
          <Download className="h-4 w-4 text-violet-700" />
          <span>Télécharger le modèle CSV</span>
        </Button>
      </div>

      {/* Étape 1 : Sélection fichier */}
      <Card>
        <CardHeader>
          <CardTitle>1. Sélectionner un fichier CSV ou Excel (.xlsx)</CardTitle>
          <CardDescription>
            Les lignes comportant des erreurs sont signalées et ne sont jamais importées
            silencieusement.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <label className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-violet-300 bg-violet-50/40 px-6 py-8 cursor-pointer hover:bg-violet-50 transition-colors dark:border-violet-800 dark:bg-violet-950/20">
            <FileSpreadsheet className="h-9 w-9 text-violet-700 mb-2" />
            <span className="text-sm font-bold text-slate-900 dark:text-white">
              {fileName ?? "Cliquez pour choisir un fichier .csv ou .xlsx"}
            </span>
            <span className="text-xs text-slate-500 mt-1">
              Encodage UTF-8 recommandé • Jusqu&apos;à 1 000 joueurs par lot
            </span>
            <input
              type="file"
              accept=".csv,.xlsx,text/csv"
              onChange={handleFileChange}
              className="hidden"
            />
          </label>
        </CardContent>
      </Card>

      {/* Étape 2 : Mappage des colonnes */}
      {sourceHeaders.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>2. Correspondance des colonnes</CardTitle>
            <CardDescription>
              Vérifiez ou ajustez la colonne source associée à chaque champ joueur.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {IMPORT_TEMPLATE_HEADERS.map((field) => (
                <div key={field}>
                  <Label>{IMPORT_FIELD_LABELS[field]}</Label>
                  <Select
                    value={mapping[field] ?? ""}
                    onChange={(e) =>
                      setMapping((prev) => ({
                        ...prev,
                        [field]: e.target.value || undefined,
                      }))
                    }
                  >
                    <option value="">— Ignorer —</option>
                    {sourceHeaders.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </Select>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Étape 3 : Prévisualisation & Rapport d'erreurs */}
      {validation ? (
        <Card>
          <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle>3. Vérification et prévisualisation ({validation.rows.length} lignes)</CardTitle>
              <CardDescription>
                {validation.validCount} prête(s) • {validation.duplicateCount} doublon(s) •{" "}
                {validation.errorCount} ligne(s) invalide(s)
              </CardDescription>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {validation.errorCount + validation.duplicateCount > 0 ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    triggerDownload(
                      buildImportErrorReportCsv(validation.rows),
                      "rapport_erreurs_import_FAFC.csv",
                    )
                  }
                >
                  <Download className="h-3.5 w-3.5 text-orange-600" />
                  <span>Télécharger le rapport d&apos;erreurs</span>
                </Button>
              ) : null}

              <Button
                onClick={handleConfirmImport}
                disabled={importing || validation.validCount === 0}
              >
                <Upload className="h-4 w-4" />
                <span>
                  {importing
                    ? "Importation..."
                    : `Confirmer l'import (${validation.validCount} valides)`}
                </span>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={skipDuplicates}
                onChange={(e) => setSkipDuplicates(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-violet-800"
              />
              <span>
                Ignorer automatiquement les joueurs déjà présents en base (recommandé)
              </span>
            </label>

            {importDone ? (
              <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-950">
                <p className="font-bold flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  Import terminé : {importDone.imported} joueur(s) créé(s),{" "}
                  {importDone.skipped_duplicates} doublon(s) ignoré(s),{" "}
                  {importDone.errors.length} rejet(s) serveur.
                </p>
              </div>
            ) : null}

            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 max-h-96">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-slate-100 text-slate-700 dark:bg-slate-950 dark:text-slate-300">
                  <tr>
                    <th className="px-3 py-2.5">Ligne</th>
                    <th className="px-3 py-2.5">Statut</th>
                    <th className="px-3 py-2.5">Nom & Prénom</th>
                    <th className="px-3 py-2.5">Naissance</th>
                    <th className="px-3 py-2.5">Détails / Erreurs détectées</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {validation.rows.slice(0, 200).map((row) => (
                    <tr key={row.rowNumber}>
                      <td className="px-3 py-2 font-mono">#{row.rowNumber}</td>
                      <td className="px-3 py-2">
                        {row.errors.length > 0 ? (
                          <Badge variant="danger">Invalide</Badge>
                        ) : row.isDuplicateExisting || row.isDuplicateInFile ? (
                          <Badge variant="warning">Doublon</Badge>
                        ) : (
                          <Badge variant="success">Valide</Badge>
                        )}
                      </td>
                      <td className="px-3 py-2 font-semibold">
                        {row.parsed
                          ? `${row.parsed.last_name} ${row.parsed.first_name}`
                          : "—"}
                      </td>
                      <td className="px-3 py-2">
                        {row.parsed?.birth_date ?? "—"}
                      </td>
                      <td className="px-3 py-2">
                        {row.errors.length > 0 ? (
                          <span className="text-red-600 font-medium inline-flex items-center gap-1">
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                            {row.errors.join(" • ")}
                          </span>
                        ) : row.isDuplicateExisting ? (
                          <span className="text-orange-700">
                            Déjà enregistré dans la base joueurs
                          </span>
                        ) : row.isDuplicateInFile ? (
                          <span className="text-orange-700">
                            Doublon à l&apos;intérieur du fichier
                          </span>
                        ) : (
                          <span className="text-emerald-700">Prêt à importer</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
