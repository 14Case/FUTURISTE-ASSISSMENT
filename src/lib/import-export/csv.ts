import Papa from "papaparse";
import { playerInputSchema } from "@/lib/validation/schemas";
import {
  normalizeText,
  parseIsoDate,
  playerDuplicateKey,
  suggestCategoryForAge,
} from "@/lib/utils";
import type { z } from "zod";

export type ValidatedPlayerRow = z.infer<typeof playerInputSchema>;

export const IMPORT_TEMPLATE_HEADERS = [
  "nom",
  "prenom",
  "date_naissance",
  "sexe",
  "categorie",
  "poste",
  "pied_dominant",
  "ancien_club",
  "annee_entree",
  "parent_nom",
  "parent_prenom",
  "parent_telephone",
  "parent_whatsapp",
  "parent_email",
  "parent_relation",
  "consentement_parental",
  "observations",
] as const;

export type ImportCanonicalField = (typeof IMPORT_TEMPLATE_HEADERS)[number];

export const IMPORT_FIELD_LABELS: Record<ImportCanonicalField, string> = {
  nom: "Nom du joueur *",
  prenom: "Prénom du joueur *",
  date_naissance: "Date de naissance * (JJ/MM/AAAA ou AAAA-MM-JJ)",
  sexe: "Sexe (M / F)",
  categorie: "Catégorie (U6-U9, U10-U13, U14-U16)",
  poste: "Poste préféré",
  pied_dominant: "Pied dominant (Droit / Gauche / Ambidextre)",
  ancien_club: "Ancien club",
  annee_entree: "Année d'entrée académie",
  parent_nom: "Nom responsable légal",
  parent_prenom: "Prénom responsable légal",
  parent_telephone: "Téléphone responsable",
  parent_whatsapp: "WhatsApp responsable",
  parent_email: "Email responsable",
  parent_relation: "Lien de parenté (Père, Mère, Tuteur...)",
  consentement_parental: "Consentement obtenu (Oui / Non)",
  observations: "Observations",
};

const HEADER_SYNONYMS: Record<ImportCanonicalField, string[]> = {
  nom: ["nom", "nom joueur", "last name", "lastname", "nom de famille"],
  prenom: ["prenom", "prénom", "prenom joueur", "first name", "firstname"],
  date_naissance: [
    "date naissance",
    "date de naissance",
    "naissance",
    "ddn",
    "birth date",
    "birthdate",
    "dob",
  ],
  sexe: ["sexe", "genre", "sex", "gender"],
  categorie: ["categorie", "catégorie", "cat", "category"],
  poste: ["poste", "poste prefere", "poste préféré", "position"],
  pied_dominant: ["pied", "pied dominant", "pied fort", "dominant foot"],
  ancien_club: ["ancien club", "club precedent", "previous club"],
  annee_entree: ["annee entree", "année entrée", "annee academie", "entry year"],
  parent_nom: ["parent nom", "nom parent", "responsable nom", "tuteur nom"],
  parent_prenom: [
    "parent prenom",
    "prenom parent",
    "responsable prenom",
    "tuteur prenom",
  ],
  parent_telephone: [
    "parent telephone",
    "telephone parent",
    "telephone",
    "tel",
    "tel parent",
    "phone",
  ],
  parent_whatsapp: ["parent whatsapp", "whatsapp", "whatsapp parent"],
  parent_email: ["parent email", "email parent", "email", "mail"],
  parent_relation: ["parent relation", "relation", "lien", "parente"],
  consentement_parental: ["consentement", "consentement parental", "accord parental"],
  observations: ["observations", "notes", "remarques", "commentaire"],
};

export function autoMapColumns(
  sourceHeaders: string[],
): Partial<Record<ImportCanonicalField, string>> {
  const mapping: Partial<Record<ImportCanonicalField, string>> = {};
  for (const field of IMPORT_TEMPLATE_HEADERS) {
    const synonyms = HEADER_SYNONYMS[field];
    const match = sourceHeaders.find((h) => {
      const norm = normalizeText(h);
      return synonyms.some((syn) => norm === normalizeText(syn));
    });
    if (match) mapping[field] = match;
  }
  return mapping;
}

/**
 * Convertit une date saisie sous différents formats (JJ/MM/AAAA, AAAA-MM-JJ) vers AAAA-MM-JJ.
 */
export function normalizeInputDate(raw: unknown): string {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return raw.toISOString().slice(0, 10);
  }
  const str = String(raw ?? "").trim();
  if (!str) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const frMatch = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(str);
  if (frMatch) {
    const dd = frMatch[1].padStart(2, "0");
    const mm = frMatch[2].padStart(2, "0");
    const yyyy = frMatch[3];
    const iso = `${yyyy}-${mm}-${dd}`;
    if (parseIsoDate(iso)) return iso;
  }
  return str;
}

function normalizeSex(raw: string): "M" | "F" | null {
  const n = normalizeText(raw);
  if (!n) return null;
  if (["m", "masculin", "garcon", "homme", "h"].includes(n)) return "M";
  if (["f", "feminin", "fille", "femme"].includes(n)) return "F";
  return null;
}

function normalizeFoot(raw: string): "right" | "left" | "both" | null {
  const n = normalizeText(raw);
  if (!n) return null;
  if (["droit", "droitier", "d", "right", "r"].includes(n)) return "right";
  if (["gauche", "gaucher", "g", "left", "l"].includes(n)) return "left";
  if (["ambidextre", "deux", "les deux", "both", "ambi"].includes(n)) return "both";
  return null;
}

function normalizeBool(raw: string): boolean {
  const n = normalizeText(raw);
  return ["oui", "yes", "true", "1", "ok", "vrai"].includes(n);
}

export interface ImportRowPreview {
  rowNumber: number;
  raw: Record<string, unknown>;
  parsed: ValidatedPlayerRow | null;
  errors: string[];
  isDuplicateExisting: boolean;
  isDuplicateInFile: boolean;
}

export interface ImportValidationSummary {
  rows: ImportRowPreview[];
  validCount: number;
  errorCount: number;
  duplicateCount: number;
}

export function validateMappedImportRows(
  rawRows: Record<string, unknown>[],
  mapping: Partial<Record<ImportCanonicalField, string>>,
  options: {
    categories: { id: string; code: string; label: string; min_age: number; max_age: number }[];
    existingDuplicateKeys: Set<string>;
    referenceDateIso?: string;
  },
): ImportValidationSummary {
  const seenKeys = new Set<string>();
  const refDate = options.referenceDateIso ?? new Date().toISOString().slice(0, 10);

  const getCell = (row: Record<string, unknown>, field: ImportCanonicalField): string => {
    const col = mapping[field];
    if (!col) return "";
    const v = row[col];
    if (v === null || v === undefined) return "";
    if (field === "date_naissance") return normalizeInputDate(v);
    return String(v).trim();
  };

  const results: ImportRowPreview[] = rawRows.map((raw, idx) => {
    const rowNumber = idx + 2; // ligne 1 = en-tête
    const last_name = getCell(raw, "nom");
    const first_name = getCell(raw, "prenom");
    const birth_date = getCell(raw, "date_naissance");
    const sexRaw = getCell(raw, "sexe");
    const catRaw = getCell(raw, "categorie");
    const footRaw = getCell(raw, "pied_dominant");
    const entryYearRaw = getCell(raw, "annee_entree");

    const rowErrors: string[] = [];
    if (sexRaw && !normalizeSex(sexRaw)) {
      rowErrors.push(`Sexe non reconnu (« ${sexRaw} ») : utilisez M ou F.`);
    }
    if (footRaw && !normalizeFoot(footRaw)) {
      rowErrors.push(
        `Pied dominant non reconnu (« ${footRaw} ») : utilisez Droit, Gauche ou Ambidextre.`,
      );
    }

    let categoryId: string | null = null;
    if (catRaw) {
      const normCat = normalizeText(catRaw).replace(/\s+/g, "");
      const matched = options.categories.find(
        (c) =>
          normalizeText(c.code).replace(/\s+/g, "") === normCat ||
          normalizeText(c.label).replace(/\s+/g, "") === normCat,
      );
      if (matched) {
        categoryId = matched.id;
      } else {
        rowErrors.push(`Catégorie inconnue : « ${catRaw} ».`);
      }
    } else if (birth_date && parseIsoDate(birth_date)) {
      categoryId =
        suggestCategoryForAge(options.categories, birth_date, refDate)?.id ?? null;
    }

    const parentLast = getCell(raw, "parent_nom");
    const parentPhone = getCell(raw, "parent_telephone");
    const guardians =
      parentLast || parentPhone
        ? [
            {
              last_name: parentLast || last_name,
              first_name: getCell(raw, "parent_prenom") || null,
              phone: parentPhone,
              whatsapp: getCell(raw, "parent_whatsapp") || null,
              email: getCell(raw, "parent_email") || null,
              relationship: getCell(raw, "parent_relation") || null,
              is_primary: true,
            },
          ]
        : [];

    const candidate = {
      last_name,
      first_name,
      birth_date,
      sex: normalizeSex(sexRaw),
      category_id: categoryId,
      preferred_position: getCell(raw, "poste") || null,
      dominant_foot: normalizeFoot(footRaw),
      previous_club: getCell(raw, "ancien_club") || null,
      academy_entry_year: entryYearRaw ? Number(entryYearRaw) : null,
      notes: getCell(raw, "observations") || null,
      status: "active" as const,
      consent_obtained: normalizeBool(getCell(raw, "consentement_parental")),
      guardians,
    };

    const parsed = playerInputSchema.safeParse(candidate);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        rowErrors.push(issue.message);
      }
    }

    const key =
      last_name && first_name && birth_date
        ? playerDuplicateKey(last_name, first_name, birth_date)
        : null;
    const isDuplicateExisting = Boolean(key && options.existingDuplicateKeys.has(key));
    const isDuplicateInFile = Boolean(key && seenKeys.has(key));
    if (key) seenKeys.add(key);

    return {
      rowNumber,
      raw,
      parsed: parsed.success && rowErrors.length === 0 ? parsed.data : null,
      errors: rowErrors,
      isDuplicateExisting,
      isDuplicateInFile,
    };
  });

  return {
    rows: results,
    validCount: results.filter(
      (r) => r.parsed && !r.isDuplicateExisting && !r.isDuplicateInFile,
    ).length,
    errorCount: results.filter((r) => r.errors.length > 0).length,
    duplicateCount: results.filter(
      (r) => r.isDuplicateExisting || r.isDuplicateInFile,
    ).length,
  };
}

/**
 * Génère une chaîne CSV encodée avec BOM UTF-8 (ouverture directe dans Excel avec accents).
 */
export function toCsvWithBom(
  rows: Record<string, string | number | boolean | null | undefined>[],
  columns?: string[],
): string {
  const csv = Papa.unparse(rows, {
    columns,
    delimiter: ";",
    newline: "\r\n",
  });
  return `\uFEFF${csv}`;
}

export function buildPlayerImportTemplateCsv(): string {
  return toCsvWithBom(
    [
      {
        nom: "EXEMPLE_NOM",
        prenom: "Exemple_Prenom",
        date_naissance: "14/05/2015",
        sexe: "M",
        categorie: "U10-U13",
        poste: "Milieu relayeur",
        pied_dominant: "Droit",
        ancien_club: "",
        annee_entree: "2026",
        parent_nom: "EXEMPLE_PARENT",
        parent_prenom: "Marie",
        parent_telephone: "+237690000000",
        parent_whatsapp: "+237690000000",
        parent_email: "parent@exemple.cm",
        parent_relation: "Mère",
        consentement_parental: "Oui",
        observations: "Supprimez cette ligne d'exemple avant import",
      },
    ],
    [...IMPORT_TEMPLATE_HEADERS],
  );
}

export function buildImportErrorReportCsv(rows: ImportRowPreview[]): string {
  const failed = rows.filter(
    (r) => r.errors.length > 0 || r.isDuplicateExisting || r.isDuplicateInFile,
  );
  return toCsvWithBom(
    failed.map((r) => ({
      ligne: r.rowNumber,
      statut:
        r.errors.length > 0
          ? "ERREUR"
          : r.isDuplicateInFile
            ? "DOUBLON_FICHIER"
            : "DOUBLON_BASE",
      details: [
        ...r.errors,
        ...(r.isDuplicateExisting
          ? ["Joueur déjà enregistré (même nom, prénom et date de naissance)."]
          : []),
        ...(r.isDuplicateInFile
          ? ["Ligne en doublon dans le fichier importé."]
          : []),
      ].join(" | "),
    })),
  );
}
