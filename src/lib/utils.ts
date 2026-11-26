import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Analyse une date ISO (YYYY-MM-DD) sans décalage de fuseau horaire.
 */
export function parseIsoDate(iso: string): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

/**
 * Calcule l'âge exact révolu (en années) d'un joueur À LA DATE DE L'ÉVALUATION.
 *
 * Règle métier stricte (Sections 7 & 19) :
 * Ne jamais utiliser la date courante de consultation pour calculer l'âge
 * d'une évaluation historique. `referenceDate` est obligatoire.
 */
export function calculateAgeAtDate(birthDateIso: string, referenceDateIso: string): number | null {
  const b = parseIsoDate(birthDateIso);
  const r = parseIsoDate(referenceDateIso);
  if (!b || !r) return null;
  let age = r.year - b.year;
  if (r.month < b.month || (r.month === b.month && r.day < b.day)) {
    age -= 1;
  }
  return age >= 0 ? age : null;
}

/**
 * Suggère la catégorie d'âge correspondant à l'âge du joueur à une date donnée.
 */
export function suggestCategoryForAge<
  T extends { id: string; min_age: number; max_age: number; is_active?: boolean },
>(categories: T[], birthDateIso: string, referenceDateIso: string): T | null {
  const age = calculateAgeAtDate(birthDateIso, referenceDateIso);
  if (age === null) return null;
  return (
    categories.find(
      (c) => (c.is_active ?? true) && age >= c.min_age && age <= c.max_age,
    ) ?? null
  );
}

/**
 * Clé normalisée d'identité joueur pour la détection des doublons :
 * (nom sans accents/espaces superflus + prénom + date de naissance).
 */
export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function playerDuplicateKey(
  lastName: string,
  firstName: string,
  birthDate: string,
): string {
  return `${normalizeText(lastName)}|${normalizeText(firstName)}|${birthDate.slice(0, 10)}`;
}

/**
 * Formate une date ISO (YYYY-MM-DD ou ISO complète) en français lisible.
 */
export function formatDateFr(iso: string | null | undefined, withTime = false): string {
  if (!iso) return "—";
  if (!withTime && /^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const p = parseIsoDate(iso);
    if (!p) return iso;
    const d = new Date(Date.UTC(p.year, p.month - 1, p.day));
    return new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(d);
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(d);
}

/**
 * Génère le nom officiel du fichier PDF :
 * FAFC_Rapport_Nom_Prenom_2026.pdf
 */
export function buildReportFileName(
  lastName: string,
  firstName: string,
  sessionDateIso: string,
): string {
  const cleanPart = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "Joueur";
  const year = /^\d{4}/.exec(sessionDateIso)?.[0] ?? String(new Date().getFullYear());
  return `FAFC_Rapport_${cleanPart(lastName)}_${cleanPart(firstName)}_${year}.pdf`;
}

export const DOMINANT_FOOT_LABELS: Record<string, string> = {
  right: "Droit",
  left: "Gauche",
  both: "Ambidextre",
};

export const SEX_LABELS: Record<string, string> = {
  M: "Masculin",
  F: "Féminin",
};

export const SESSION_STATUS_LABELS: Record<string, string> = {
  draft: "Brouillon",
  in_progress: "En cours",
  to_validate: "À valider",
  finalized: "Finalisée",
  archived: "Archivée",
};

export const PLAYER_STATUS_LABELS: Record<string, string> = {
  active: "Actif",
  inactive: "Inactif",
  archived: "Archivé",
};

export const EVALUATION_STATUS_LABELS: Record<string, string> = {
  pending: "En attente",
  in_progress: "En cours",
  completed: "Terminé",
  absent: "Absent",
  exempt: "Dispensé",
};

export const POSITIONS_CATALOG = [
  "Gardien de but",
  "Défenseur central",
  "Latéral",
  "Milieu défensif",
  "Milieu relayeur",
  "Milieu offensif",
  "Ailier",
  "Attaquant",
  "Polyvalent / En découverte",
] as const;
