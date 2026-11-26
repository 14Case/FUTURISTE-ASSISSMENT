import Dexie, { type Table } from "dexie";
import type {
  AssessmentCategory,
  AssessmentDomain,
  AssessmentSession,
  AssessmentTest,
  Player,
  RubricVersion,
  SessionAssignment,
  SessionPlayer,
  TestAgeRule,
  TestEvaluation,
} from "@/lib/types/database";
import type { ComponentInput, EvaluationStatus } from "@/lib/scoring/types";

export interface SessionPlayerEntry extends SessionPlayer {
  player: Pick<
    Player,
    | "id"
    | "player_number"
    | "last_name"
    | "first_name"
    | "birth_date"
    | "sex"
    | "preferred_position"
    | "dominant_foot"
    | "is_demo"
  >;
}

export interface OfflineSessionBundle {
  session_id: string;
  session: AssessmentSession;
  categories: AssessmentCategory[];
  domains: AssessmentDomain[];
  tests: AssessmentTest[];
  age_rules: TestAgeRule[];
  rubrics: RubricVersion[];
  assignments: SessionAssignment[];
  session_players: SessionPlayerEntry[];
  evaluations: TestEvaluation[];
  sex_field_enabled: boolean;
  preloaded_at: string;
}

export type OutboxState = "pending" | "syncing" | "synced" | "conflict" | "error";

export interface OutboxOperation {
  op_id: string;
  dedupe_key: string; // `${session_id}:${player_id}:${test_id}`
  session_id: string;
  player_id: string;
  test_id: string;
  base_version: number;
  supersedes: string[];
  status: EvaluationStatus;
  components: ComponentInput[];
  comment: string | null;
  reason?: string | null;
  state: OutboxState;
  error_message: string | null;
  conflict_server: {
    server_version: number;
    status: EvaluationStatus;
    points: number | null;
    comment: string | null;
    updated_at: string;
  } | null;
  created_at: string;
  updated_at: string;
  synced_at: string | null;
}

export class FuturisteOfflineDB extends Dexie {
  sessionBundles!: Table<OfflineSessionBundle, string>;
  outbox!: Table<OutboxOperation, string>;

  constructor(name = "futuriste_assessment_offline_v1") {
    super(name);
    this.version(1).stores({
      sessionBundles: "session_id, preloaded_at",
      outbox: "op_id, dedupe_key, session_id, state, updated_at",
    });
  }
}

let dbInstance: FuturisteOfflineDB | null = null;

export function getOfflineDb(): FuturisteOfflineDB {
  if (!dbInstance) {
    dbInstance = new FuturisteOfflineDB();
  }
  return dbInstance;
}

/**
 * Enregistre ou fusionne localement une saisie terrain dans la file d'attente IndexedDB.
 * Protection anti-doublon : si une opération non synchronisée existe déjà pour
 * le triplet (session, joueur, atelier), elle est remplacée par une nouvelle op_id
 * qui conserve `base_version` et chaîne l'ancien `op_id` dans `supersedes`.
 */
export async function enqueueEvaluationOp(
  input: {
    session_id: string;
    player_id: string;
    test_id: string;
    known_server_version: number;
    status: EvaluationStatus;
    components: ComponentInput[];
    comment: string | null;
    reason?: string | null;
  },
  db: FuturisteOfflineDB = getOfflineDb(),
): Promise<OutboxOperation> {
  const dedupe_key = `${input.session_id}:${input.player_id}:${input.test_id}`;
  const now = new Date().toISOString();

  return db.transaction("rw", db.outbox, async () => {
    const existing = await db.outbox
      .where("dedupe_key")
      .equals(dedupe_key)
      .and((op) => op.state !== "synced")
      .first();

    const newOpId = crypto.randomUUID();

    if (existing) {
      const supersedes = [...new Set([...existing.supersedes, existing.op_id])];
      const base_version = existing.base_version;
      await db.outbox.delete(existing.op_id);
      const nextOp: OutboxOperation = {
        op_id: newOpId,
        dedupe_key,
        session_id: input.session_id,
        player_id: input.player_id,
        test_id: input.test_id,
        base_version,
        supersedes,
        status: input.status,
        components: input.components,
        comment: input.comment,
        reason: input.reason ?? null,
        state: "pending",
        error_message: null,
        conflict_server: null,
        created_at: existing.created_at,
        updated_at: now,
        synced_at: null,
      };
      await db.outbox.put(nextOp);
      return nextOp;
    }

    const freshOp: OutboxOperation = {
      op_id: newOpId,
      dedupe_key,
      session_id: input.session_id,
      player_id: input.player_id,
      test_id: input.test_id,
      base_version: input.known_server_version,
      supersedes: [],
      status: input.status,
      components: input.components,
      comment: input.comment,
      reason: input.reason ?? null,
      state: "pending",
      error_message: null,
      conflict_server: null,
      created_at: now,
      updated_at: now,
      synced_at: null,
    };
    await db.outbox.put(freshOp);
    return freshOp;
  });
}

/**
 * Purge locale lors de la déconnexion d'un utilisateur (uniquement les caches
 * déjà synchronisés ; avertit s'il reste des opérations non synchronisées).
 */
export async function countUnsyncedOperations(
  db: FuturisteOfflineDB = getOfflineDb(),
): Promise<{ pending: number; conflicts: number; errors: number }> {
  const all = await db.outbox.where("state").notEqual("synced").toArray();
  return {
    pending: all.filter((o) => o.state === "pending" || o.state === "syncing").length,
    conflicts: all.filter((o) => o.state === "conflict").length,
    errors: all.filter((o) => o.state === "error").length,
  };
}
