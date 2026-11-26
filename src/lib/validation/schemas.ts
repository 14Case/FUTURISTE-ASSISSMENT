import { z } from "zod";
import { DOMAIN_CODES, MEASURE_TYPES } from "@/lib/scoring/types";

const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;

export const uuidSchema = z.string().uuid("Identifiant invalide.");

export const isoDateSchema = z
  .string()
  .regex(isoDateRegex, "Date attendue au format AAAA-MM-JJ.")
  .refine((val) => {
    const [y, m, d] = val.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return (
      dt.getUTCFullYear() === y &&
      dt.getUTCMonth() === m - 1 &&
      dt.getUTCDate() === d
    );
  }, "Date calendaire invalide.");

// ---------------------------------------------------------------------------
// Authentification & Comptes
// ---------------------------------------------------------------------------

export const loginSchema = z.object({
  email: z.string().trim().email("Adresse email invalide."),
  password: z.string().min(8, "Le mot de passe contient au moins 8 caractères."),
});

export const bootstrapAdminSchema = z.object({
  full_name: z.string().trim().min(2, "Nom complet requis.").max(100),
  email: z.string().trim().email("Adresse email invalide."),
  password: z
    .string()
    .min(10, "Le mot de passe administrateur doit comporter au moins 10 caractères."),
  secret: z.string().optional(),
});

export const createUserAccountSchema = z.object({
  full_name: z.string().trim().min(2, "Nom complet requis.").max(100),
  email: z.string().trim().email("Adresse email invalide."),
  phone: z.string().trim().max(25).optional().nullable(),
  role: z.enum(["admin", "coach"]),
  password: z
    .string()
    .min(8, "Le mot de passe initial doit comporter au moins 8 caractères."),
});

export const updateProfileSchema = z.object({
  full_name: z.string().trim().min(2, "Nom complet requis.").max(100),
  phone: z.string().trim().max(25).optional().nullable(),
  role: z.enum(["admin", "coach"]).optional(),
  is_active: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// Joueurs & Responsables légaux
// ---------------------------------------------------------------------------

export const guardianInputSchema = z.object({
  id: uuidSchema.optional(),
  last_name: z
    .string()
    .trim()
    .min(1, "Nom du responsable requis.")
    .max(80, "Maximum 80 caractères."),
  first_name: z.string().trim().max(80).optional().nullable(),
  phone: z
    .string()
    .trim()
    .min(6, "Numéro de téléphone invalide (6 chiffres minimum).")
    .max(25),
  whatsapp: z.string().trim().max(25).optional().nullable(),
  email: z
    .union([z.literal(""), z.string().trim().email("Email invalide.")])
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
  relationship: z.string().trim().max(60).optional().nullable(),
  is_primary: z.boolean().default(false),
});

export const playerInputSchema = z.object({
  player_number: z
    .string()
    .trim()
    .max(30)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  last_name: z
    .string()
    .trim()
    .min(1, "Le nom est obligatoire.")
    .max(80, "Maximum 80 caractères."),
  first_name: z
    .string()
    .trim()
    .min(1, "Le prénom est obligatoire.")
    .max(80, "Maximum 80 caractères."),
  birth_date: isoDateSchema.refine(
    (d) => d > "1990-01-01" && d <= new Date().toISOString().slice(0, 10),
    "La date de naissance doit être comprise entre 1990 et aujourd'hui.",
  ),
  sex: z.enum(["M", "F"]).optional().nullable(),
  category_id: uuidSchema.optional().nullable(),
  preferred_position: z.string().trim().max(60).optional().nullable(),
  dominant_foot: z.enum(["right", "left", "both"]).optional().nullable(),
  previous_club: z.string().trim().max(100).optional().nullable(),
  academy_entry_year: z
    .union([z.number().int().min(2000).max(2100), z.nan(), z.null()])
    .optional()
    .transform((v) => (typeof v === "number" && !Number.isNaN(v) ? v : null)),
  notes: z.string().trim().max(2000).optional().nullable(),
  status: z.enum(["active", "inactive", "archived"]).default("active"),
  consent_obtained: z.boolean().default(false),
  consent_date: z
    .union([z.literal(""), isoDateSchema])
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
  consent_note: z.string().trim().max(500).optional().nullable(),
  external_ref: z
    .string()
    .trim()
    .max(80)
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null)),
  is_demo: z.boolean().optional().default(false),
  guardians: z.array(guardianInputSchema).default([]),
});

export const playerImportBatchSchema = z.object({
  rows: z.array(playerInputSchema).min(1, "Aucune ligne valide à importer.").max(1000),
  skip_duplicates: z.boolean().default(true),
});

// ---------------------------------------------------------------------------
// Saisons, Catégories & Paramètres Club
// ---------------------------------------------------------------------------

export const seasonInputSchema = z
  .object({
    label: z
      .string()
      .trim()
      .regex(/^\d{4}[–-]\d{4}$/, "Format attendu : 2026–2027."),
    start_date: z
      .union([z.literal(""), isoDateSchema])
      .optional()
      .nullable()
      .transform((v) => (v ? v : null)),
    end_date: z
      .union([z.literal(""), isoDateSchema])
      .optional()
      .nullable()
      .transform((v) => (v ? v : null)),
  })
  .refine(
    (s) => !s.start_date || !s.end_date || s.end_date > s.start_date,
    { message: "La date de fin doit être postérieure à la date de début.", path: ["end_date"] },
  );

export const categoryInputSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(2, "Code requis (ex: U10-U13).")
      .max(20)
      .regex(/^[A-Za-z0-9_-]+$/, "Caractères alphanumériques, tirets ou underscores uniquement."),
    label: z.string().trim().min(2, "Libellé requis.").max(50),
    min_age: z.number().int().min(3).max(25),
    max_age: z.number().int().min(3).max(25),
    sort_order: z.number().int().min(0).max(100).default(0),
    description: z.string().trim().max(300).optional().nullable(),
    is_active: z.boolean().default(true),
  })
  .refine((c) => c.max_age >= c.min_age, {
    message: "L'âge maximum doit être supérieur ou égal à l'âge minimum.",
    path: ["max_age"],
  });

export const clubSettingsInputSchema = z.object({
  club_name: z.string().trim().min(2).max(120),
  tagline: z.string().trim().max(200),
  primary_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Couleur hexadécimale attendue (#RRGGBB)."),
  secondary_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Couleur hexadécimale attendue (#RRGGBB)."),
  current_season_id: uuidSchema.optional().nullable(),
  sex_field_enabled: z.boolean(),
  analysis_enabled: z.boolean(),
  parent_message_template: z.string().max(4000),
  report_footer: z.string().max(400),
  report_signatory: z.string().max(120),
  sync_settings: z.object({
    auto_sync: z.boolean(),
    retry_interval_seconds: z.number().int().min(10).max(600),
  }),
  units: z.object({
    time: z.string().trim().min(1).max(10),
    distance: z.string().trim().min(1).max(10),
  }),
});

// ---------------------------------------------------------------------------
// Tests, Protocoles & Barèmes
// ---------------------------------------------------------------------------

export const testInputSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z][A-Z0-9_]{0,9}$/, "Code atelier attendu (ex: A1, T2, COORD_1)."),
  name: z.string().trim().min(2).max(100),
  domain: z.enum(DOMAIN_CODES),
  max_points: z.number().positive().max(100),
  description: z.string().trim().max(1000).optional().nullable(),
  instructions: z.string().trim().max(3000).optional().nullable(),
  sort_order: z.number().int().min(0).max(200).default(0),
  is_active: z.boolean().default(true),
});

export const ageRuleInputSchema = z.object({
  test_id: uuidSchema,
  category_id: uuidSchema,
  protocol: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
  protocol_text: z.string().trim().max(500).optional().nullable(),
});

const thresholdSchema = z.object({
  bound: z.number().finite(),
  points: z.number().min(0),
});

const measuredScoringSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("thresholds"),
    thresholds: z.array(thresholdSchema).min(1, "Définissez au moins un seuil."),
  }),
  z.object({
    mode: z.literal("linear"),
    best: z.number().finite(),
    worst: z.number().finite(),
    round_to: z.number().positive().max(5),
  }),
  z.object({
    mode: z.literal("none"),
  }),
]);

const penaltySchema = z.object({
  label: z.string().trim().min(1).max(80),
  mode: z.enum(["add_to_value", "subtract_points"]),
  amount: z.number().min(0).max(50),
});

const measuredComponentSchema = z.object({
  key: z.string().regex(/^[a-z0-9_]{1,40}$/, "Clé technique minuscule requise."),
  label: z.string().trim().min(1).max(120),
  kind: z.literal("measured"),
  max_points: z.number().positive().max(100),
  measure_type: z.enum(MEASURE_TYPES),
  unit: z.string().trim().min(1).max(20),
  direction: z.enum(["higher_better", "lower_better"]),
  attempts: z.number().int().min(1).max(20),
  aggregation: z.enum(["best", "average", "sum", "last"]),
  min_value: z.number().finite().optional().nullable(),
  max_value: z.number().finite().optional().nullable(),
  out_of: z.number().int().positive().optional().nullable(),
  scoring: measuredScoringSchema,
  penalty: penaltySchema.optional().nullable(),
  help: z.string().max(400).optional(),
});

const qualitativeLevelSchema = z.object({
  value: z.number().min(0).max(100),
  label: z.string().trim().min(1).max(60),
  description: z.string().trim().min(1).max(300),
});

const qualitativeComponentSchema = z.object({
  key: z.string().regex(/^[a-z0-9_]{1,40}$/, "Clé technique minuscule requise."),
  label: z.string().trim().min(1).max(120),
  kind: z.literal("qualitative"),
  max_points: z.number().positive().max(100),
  levels: z.array(qualitativeLevelSchema).min(2, "Au moins 2 niveaux requis."),
  help: z.string().max(400).optional(),
});

export const rubricConfigSchema = z.object({
  schema_version: z.literal(1),
  components: z
    .array(z.discriminatedUnion("kind", [measuredComponentSchema, qualitativeComponentSchema]))
    .min(1, "Le barème doit comporter au moins un critère."),
  calculation_note: z.string().max(500).optional(),
});

export const rubricVersionInputSchema = z.object({
  test_id: uuidSchema,
  category_id: uuidSchema.optional().nullable(),
  sex: z.enum(["M", "F"]).optional().nullable(),
  status: z.enum(["draft", "active"]).default("draft"),
  effective_from: isoDateSchema,
  config: rubricConfigSchema,
  notes: z.string().trim().max(1000).optional().nullable(),
});

// ---------------------------------------------------------------------------
// Sessions, Affectations & Inscriptions
// ---------------------------------------------------------------------------

export const sessionInputSchema = z.object({
  name: z.string().trim().min(3, "Nom de session trop court.").max(160),
  description: z.string().trim().max(2000).optional().nullable(),
  session_date: isoDateSchema,
  start_time: z
    .union([z.literal(""), z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/)])
    .optional()
    .nullable()
    .transform((v) => (v ? v.slice(0, 5) : null)),
  location: z.string().trim().max(200).optional().nullable(),
  season_id: uuidSchema,
  category_ids: z.array(uuidSchema).min(1, "Sélectionnez au moins une catégorie."),
  test_ids: z.array(uuidSchema).min(1, "Activez au moins un atelier."),
  reason: z.string().trim().max(500).optional().nullable(),
});

export const sessionStatusInputSchema = z.object({
  status: z.enum(["draft", "in_progress", "to_validate", "finalized", "archived"]),
  reason: z.string().trim().max(500).optional().nullable(),
});

export const sessionPlayersBatchSchema = z.object({
  players: z
    .array(
      z.object({
        player_id: uuidSchema,
        category_id: uuidSchema,
        bib_number: z.string().trim().max(15).optional().nullable(),
      }),
    )
    .min(1)
    .max(500),
  reason: z.string().trim().max(500).optional().nullable(),
});

export const sessionAssignmentInputSchema = z.object({
  user_id: uuidSchema,
  test_id: uuidSchema.optional().nullable(),
  category_id: uuidSchema.optional().nullable(),
});

// ---------------------------------------------------------------------------
// Évaluations Terrain & Synchronisation
// ---------------------------------------------------------------------------

export const attemptInputSchema = z.object({
  value: z.number().finite().nullable(),
  penalties: z.number().int().min(0).max(50).default(0),
  is_valid: z.boolean().default(true),
});

export const componentInputSchema = z.object({
  key: z.string().regex(/^[a-z0-9_]{1,40}$/),
  attempts: z.array(attemptInputSchema).max(20),
});

export const evaluationOpSchema = z.object({
  op_id: uuidSchema,
  session_id: uuidSchema,
  player_id: uuidSchema,
  test_id: uuidSchema,
  base_version: z.number().int().min(0).default(0),
  supersedes: z.array(uuidSchema).max(50).default([]),
  status: z.enum(["pending", "in_progress", "completed", "absent", "exempt"]),
  components: z.array(componentInputSchema),
  comment: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null)),
  reason: z.string().trim().max(500).optional().nullable(),
});

export const syncBatchSchema = z.object({
  operations: z.array(evaluationOpSchema).min(1).max(200),
});

export const scoreOverrideSchema = z.object({
  session_id: uuidSchema,
  player_id: uuidSchema,
  analysis_enabled: z.boolean(),
  coach_comment: z.string().trim().max(3000).optional().nullable(),
  override_summary: z.string().trim().max(2000).optional().nullable(),
  override_recommendations: z.array(z.string().trim().min(1).max(400)).max(8).optional(),
  validate: z.boolean().default(false),
  reason: z.string().trim().max(500).optional().nullable(),
});
