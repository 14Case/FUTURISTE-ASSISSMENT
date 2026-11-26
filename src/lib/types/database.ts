import type { AnalysisResult } from "@/lib/analysis/rules";
import type {
  ComponentResult,
  DomainCode,
  EvaluationStatus,
  RubricConfig,
  ScoreStatus,
  TotalResult,
} from "@/lib/scoring/types";

export type AppRole = "admin" | "coach";
export type PlayerStatus = "active" | "inactive" | "archived";
export type SessionStatus =
  | "draft"
  | "in_progress"
  | "to_validate"
  | "finalized"
  | "archived";
export type RubricStatus = "draft" | "active" | "archived";
export type SessionPlayerStatus = "registered" | "present" | "absent" | "withdrawn";
export type ReportStatus = "generated" | "outdated" | "archived";

export interface Profile {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  role: AppRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ClubSettings {
  id: number;
  club_name: string;
  tagline: string;
  logo_path: string | null;
  primary_color: string;
  secondary_color: string;
  current_season_id: string | null;
  sex_field_enabled: boolean;
  analysis_enabled: boolean;
  parent_message_template: string;
  report_footer: string;
  report_signatory: string;
  sync_settings: { auto_sync: boolean; retry_interval_seconds: number };
  units: { time: string; distance: string };
  updated_at: string;
}

export interface Season {
  id: string;
  label: string;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
}

export interface AssessmentCategory {
  id: string;
  code: string;
  label: string;
  min_age: number;
  max_age: number;
  sort_order: number;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AssessmentDomain {
  code: DomainCode;
  label: string;
  max_points: number;
  sort_order: number;
  description: string | null;
}

export interface Guardian {
  id: string;
  last_name: string;
  first_name: string | null;
  phone: string;
  whatsapp: string | null;
  email: string | null;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
}

export interface GuardianLink {
  guardian: Guardian;
  relationship: string | null;
  is_primary: boolean;
}

export interface Player {
  id: string;
  player_number: string;
  last_name: string;
  first_name: string;
  birth_date: string;
  sex: "M" | "F" | null;
  photo_path: string | null;
  category_id: string | null;
  preferred_position: string | null;
  dominant_foot: "right" | "left" | "both" | null;
  previous_club: string | null;
  academy_entry_year: number | null;
  notes: string | null;
  status: PlayerStatus;
  consent_obtained: boolean;
  consent_date: string | null;
  consent_note: string | null;
  is_demo: boolean;
  external_ref: string | null;
  archived_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlayerWithRelations extends Player {
  category?: AssessmentCategory | null;
  guardians?: GuardianLink[];
}

export interface AssessmentTest {
  id: string;
  code: string;
  name: string;
  domain: DomainCode;
  max_points: number;
  description: string | null;
  instructions: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TestAgeRule {
  id: string;
  test_id: string;
  category_id: string;
  protocol: Record<string, unknown>;
  protocol_text: string | null;
  updated_at: string;
}

export interface RubricVersion {
  id: string;
  test_id: string;
  category_id: string | null;
  sex: "M" | "F" | null;
  version: number;
  status: RubricStatus;
  effective_from: string;
  config: RubricConfig;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  activated_at: string | null;
  archived_at: string | null;
}

export interface AssessmentSession {
  id: string;
  name: string;
  description: string | null;
  session_date: string;
  start_time: string | null;
  location: string | null;
  season_id: string;
  status: SessionStatus;
  is_demo: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  finalized_at: string | null;
  finalized_by: string | null;
}

export interface SessionPlayer {
  id: string;
  session_id: string;
  player_id: string;
  category_id: string;
  bib_number: string | null;
  status: SessionPlayerStatus;
  added_at: string;
}

export interface SessionAssignment {
  id: string;
  session_id: string;
  user_id: string;
  test_id: string | null;
  category_id: string | null;
  created_at: string;
}

export interface TestAttempt {
  id: string;
  evaluation_id: string;
  component_key: string;
  attempt_number: number;
  value: number | null;
  penalties: number;
  is_valid: boolean;
}

export interface TestEvaluation {
  id: string;
  session_id: string;
  player_id: string;
  test_id: string;
  rubric_version_id: string | null;
  status: EvaluationStatus;
  points: number | null;
  score_status: ScoreStatus;
  component_scores: ComponentResult[];
  comment: string | null;
  evaluated_by: string | null;
  evaluated_at: string;
  validated_by: string | null;
  validated_at: string | null;
  version: number;
  last_op_id: string | null;
  created_at: string;
  updated_at: string;
  attempts?: TestAttempt[];
}

export interface AssessmentScore {
  id: string;
  session_id: string;
  player_id: string;
  category_id: string;
  athletic: number | null;
  technical: number | null;
  physical: number | null;
  game_intelligence: number | null;
  team_spirit: number | null;
  total: number | null;
  is_complete: boolean;
  details: TotalResult;
  rubric_version_ids: string[];
  profile_labels: string[];
  analysis: AnalysisResult;
  analysis_enabled: boolean;
  analysis_overridden: boolean;
  coach_comment: string | null;
  computed_at: string;
  validated_by: string | null;
  validated_at: string | null;
  updated_at: string;
}

export interface AssessmentReport {
  id: string;
  session_id: string;
  player_id: string;
  score_id: string | null;
  storage_path: string;
  file_name: string;
  version: number;
  status: ReportStatus;
  file_size: number | null;
  checksum: string | null;
  page_count: number | null;
  generated_by: string | null;
  generated_at: string;
  archived_at: string | null;
}

export interface AuditLog {
  id: number;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  session_id: string | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  reason: string | null;
  created_at: string;
}
