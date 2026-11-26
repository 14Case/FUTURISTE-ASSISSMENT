import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import {
  Document,
  Page,
  View,
  Text,
  Image,
  Svg,
  Polygon,
  Line,
  Circle,
  Path,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { PlayerSessionAssessment } from "@/lib/server/consolidation";
import { DOMINANT_FOOT_LABELS, formatDateFr } from "@/lib/utils";

const COLORS = {
  violet: "#5B21B6",
  violetDark: "#3B0764",
  violetSoft: "#F3E8FF",
  sky: "#7DD3FC",
  skyDeep: "#0284C7",
  skySoft: "#E0F2FE",
  slate: "#0F172A",
  slateMuted: "#475569",
  border: "#E2E8F0",
  bgSoft: "#F8FAFC",
  green: "#16A34A",
  greenSoft: "#DCFCE7",
  orange: "#EA580C",
  orangeSoft: "#FFEDD5",
  white: "#FFFFFF",
};

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9.5,
    color: COLORS.slate,
    backgroundColor: COLORS.white,
    paddingTop: 28,
    paddingBottom: 42,
    paddingHorizontal: 32,
  },
  headerStrip: {
    backgroundColor: COLORS.violet,
    borderRadius: 10,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  miniHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 8,
    marginBottom: 12,
    borderBottomWidth: 1.5,
    borderBottomColor: COLORS.violet,
  },
  clubTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 16,
    color: COLORS.white,
    letterSpacing: 0.8,
  },
  clubSub: {
    fontSize: 9,
    color: COLORS.sky,
    marginTop: 2,
  },
  seasonPill: {
    backgroundColor: COLORS.violetDark,
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 9,
    borderWidth: 1,
    borderColor: COLORS.sky,
  },
  seasonPillText: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8.5,
    color: COLORS.sky,
  },
  sectionTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 11.5,
    color: COLORS.violet,
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  card: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 12,
    backgroundColor: COLORS.bgSoft,
    marginBottom: 12,
  },
  grid2: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  fieldBox: {
    width: "48%",
    marginBottom: 8,
  },
  fieldLabel: {
    fontSize: 7.5,
    color: COLORS.slateMuted,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  fieldValue: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10.5,
    color: COLORS.slate,
  },
  scoreHero: {
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: COLORS.violet,
    backgroundColor: COLORS.violetSoft,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
    marginBottom: 12,
  },
  scoreNumber: {
    fontFamily: "Helvetica-Bold",
    fontSize: 32,
    color: COLORS.violet,
  },
  scoreMax: {
    fontSize: 13,
    color: COLORS.slateMuted,
  },
  footer: {
    position: "absolute",
    bottom: 16,
    left: 32,
    right: 32,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 6,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7.5,
    color: COLORS.slateMuted,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: COLORS.violet,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    paddingVertical: 5,
    paddingHorizontal: 6,
  },
  tableHeaderCell: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7.5,
    color: COLORS.white,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.75,
    borderBottomColor: COLORS.border,
    paddingVertical: 4.5,
    paddingHorizontal: 6,
    alignItems: "flex-start",
  },
  tableCell: {
    fontSize: 8,
    color: COLORS.slate,
  },
  pill: {
    backgroundColor: COLORS.skySoft,
    borderRadius: 10,
    paddingVertical: 3,
    paddingHorizontal: 8,
    marginRight: 6,
    marginBottom: 4,
  },
  pillText: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8.5,
    color: COLORS.skyDeep,
  },
  demoBanner: {
    backgroundColor: COLORS.orangeSoft,
    borderWidth: 1,
    borderColor: COLORS.orange,
    borderRadius: 6,
    padding: 6,
    marginBottom: 8,
  },
  demoText: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    color: COLORS.orange,
    textAlign: "center",
  },
});

let cachedLogoDataUri: string | null | undefined;

function getOfficialLogoDataUri(): string | null {
  if (cachedLogoDataUri !== undefined) return cachedLogoDataUri;
  try {
    const logoFile = join(process.cwd(), "public", "brand", "logo-pdf.png");
    if (existsSync(logoFile)) {
      const b64 = readFileSync(logoFile).toString("base64");
      cachedLogoDataUri = `data:image/png;base64,${b64}`;
      return cachedLogoDataUri;
    }
  } catch {
    // Repli sur le blason vectoriel si indisponible
  }
  cachedLogoDataUri = null;
  return null;
}

function ClubEmblem({ size = 48 }: { size?: number }) {
  const logoSrc = getOfficialLogoDataUri();
  if (logoSrc) {
    return (
      <View
        style={{
          width: size + 4,
          height: size + 4,
          borderRadius: (size + 4) / 2,
          backgroundColor: COLORS.white,
          padding: 2,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* eslint-disable-next-line jsx-a11y/alt-text */}
        <Image
          src={logoSrc}
          style={{ width: size, height: size, borderRadius: size / 2 }}
        />
      </View>
    );
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Path
        d="M50 6 L88 21 V50 C88 73 72 90 50 97 C28 90 12 73 12 50 V21 Z"
        fill={COLORS.violetDark}
        stroke={COLORS.sky}
        strokeWidth={3.5}
      />
      <Circle cx={50} cy={44} r={16} stroke={COLORS.sky} strokeWidth={2} fill="none" />
      <Polygon points="50,32 57,38 54,46 46,46 43,38" fill={COLORS.sky} />
    </Svg>
  );
}

/**
 * Graphique Radar vectoriel à 5 axes normalisés sur 100.
 */
function RadarSvg({
  axes,
}: {
  axes: { label: string; normalized: number | null }[];
}) {
  const cx = 120;
  const cy = 105;
  const radius = 70;
  const levels = [0.25, 0.5, 0.75, 1];
  const n = axes.length;

  const pointAt = (index: number, ratio: number) => {
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / n;
    return {
      x: cx + radius * ratio * Math.cos(angle),
      y: cy + radius * ratio * Math.sin(angle),
    };
  };

  const dataPoints = axes.map((a, idx) =>
    pointAt(idx, Math.max(0, Math.min(1, (a.normalized ?? 0) / 100))),
  );
  const polygonStr = dataPoints
    .map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");

  return (
    <Svg width={240} height={210} viewBox="0 0 240 210">
      {levels.map((lvl) => {
        const ring = axes
          .map((_, i) => {
            const p = pointAt(i, lvl);
            return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
          })
          .join(" ");
        return (
          <Polygon
            key={lvl}
            points={ring}
            stroke={COLORS.border}
            strokeWidth={1}
            fill={lvl === 1 ? COLORS.bgSoft : "none"}
          />
        );
      })}
      {axes.map((_, i) => {
        const end = pointAt(i, 1);
        return (
          <Line
            key={i}
            x1={cx}
            y1={cy}
            x2={end.x}
            y2={end.y}
            stroke={COLORS.border}
            strokeWidth={1}
          />
        );
      })}
      <Polygon
        points={polygonStr}
        fill={COLORS.sky}
        fillOpacity={0.35}
        stroke={COLORS.violet}
        strokeWidth={2}
      />
      {dataPoints.map((p, i) => (
        <Circle key={i} cx={p.x} cy={p.y} r={3} fill={COLORS.violet} />
      ))}
    </Svg>
  );
}

function PageFooter({
  clubName,
  footerNote,
  playerLabel,
  pageNumber,
}: {
  clubName: string;
  footerNote: string;
  playerLabel: string;
  pageNumber: number;
}) {
  return (
    <View style={styles.footer} fixed>
      <Text>
        {clubName} — {footerNote}
      </Text>
      <Text>
        {playerLabel} • Page {pageNumber} / 4
      </Text>
    </View>
  );
}

export interface ReportRenderProps {
  assessment: PlayerSessionAssessment;
  seasonLabel: string;
  validatorName: string | null;
  generatedAtIso: string;
}

export function AssessmentReportDocument({
  assessment,
  seasonLabel,
  validatorName,
  generatedAtIso,
}: ReportRenderProps) {
  const {
    player,
    session,
    session_player,
    category,
    age_at_session,
    entries,
    total,
    analysis,
    stored_score,
    club_settings,
  } = assessment;

  const clubName = club_settings?.club_name ?? "FUTURISTE ACADÉMIE FC";
  const tagline =
    club_settings?.tagline ?? "Former, développer et révéler les talents.";
  const footerNote =
    club_settings?.report_footer ??
    "Document confidentiel destiné au responsable légal du joueur.";
  const signatory =
    validatorName ||
    club_settings?.report_signatory ||
    "Direction Technique — FUTURISTE ACADÉMIE FC";

  const isDemo = Boolean(player.is_demo || session.is_demo);
  const fullName = `${player.last_name.toUpperCase()} ${player.first_name}`;
  const analysisEnabled =
    stored_score?.analysis_enabled ?? club_settings?.analysis_enabled ?? true;
  const coachComment = stored_score?.coach_comment ?? null;

  const radarAxes = total.domains.map((d) => ({
    label: d.label,
    normalized: d.normalized,
  }));

  return (
    <Document
      title={`Rapport individuel — ${fullName}`}
      author={clubName}
      subject={`Évaluation sportive — ${session.name}`}
      language="fr"
    >
      {/* ============================== PAGE 1 ============================== */}
      <Page size="A4" style={styles.page}>
        {isDemo ? (
          <View style={styles.demoBanner}>
            <Text style={styles.demoText}>
              DONNÉES DE DÉMONSTRATION (DEMO) — DOCUMENT NON OFFICIEL
            </Text>
          </View>
        ) : null}

        <View style={styles.headerStrip}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <ClubEmblem size={48} />
            <View style={{ marginLeft: 12 }}>
              <Text style={styles.clubTitle}>{clubName}</Text>
              <Text style={styles.clubSub}>{tagline}</Text>
            </View>
          </View>
          <View style={styles.seasonPill}>
            <Text style={styles.seasonPillText}>SAISON {seasonLabel}</Text>
          </View>
        </View>

        <View style={{ marginBottom: 12 }}>
          <Text
            style={{
              fontSize: 8.5,
              color: COLORS.skyDeep,
              fontFamily: "Helvetica-Bold",
              textTransform: "uppercase",
            }}
          >
            Rapport individuel d&apos;évaluation sportive
          </Text>
          <Text
            style={{
              fontSize: 18,
              fontFamily: "Helvetica-Bold",
              color: COLORS.slate,
              marginTop: 2,
            }}
          >
            {fullName}
          </Text>
          <Text style={{ fontSize: 9.5, color: COLORS.slateMuted, marginTop: 2 }}>
            {session.name}
            {session.location ? ` • ${session.location}` : ""}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Identité sportive & session</Text>
          <View style={styles.grid2}>
            <View style={styles.fieldBox}>
              <Text style={styles.fieldLabel}>Numéro joueur</Text>
              <Text style={styles.fieldValue}>
                {player.player_number}
                {session_player.bib_number
                  ? ` (Dossard ${session_player.bib_number})`
                  : ""}
              </Text>
            </View>
            <View style={styles.fieldBox}>
              <Text style={styles.fieldLabel}>Catégorie évaluée</Text>
              <Text style={styles.fieldValue}>{category.label}</Text>
            </View>
            <View style={styles.fieldBox}>
              <Text style={styles.fieldLabel}>Date d&apos;évaluation</Text>
              <Text style={styles.fieldValue}>
                {formatDateFr(session.session_date)}
              </Text>
            </View>
            <View style={styles.fieldBox}>
              <Text style={styles.fieldLabel}>
                Date de naissance & âge au test
              </Text>
              <Text style={styles.fieldValue}>
                {formatDateFr(player.birth_date)}
                {age_at_session !== null ? ` (${age_at_session} ans)` : ""}
              </Text>
            </View>
            <View style={styles.fieldBox}>
              <Text style={styles.fieldLabel}>Poste préférentiel déclaré</Text>
              <Text style={styles.fieldValue}>
                {player.preferred_position || "Non renseigné"}
              </Text>
            </View>
            <View style={styles.fieldBox}>
              <Text style={styles.fieldLabel}>Pied dominant</Text>
              <Text style={styles.fieldValue}>
                {player.dominant_foot
                  ? (DOMINANT_FOOT_LABELS[player.dominant_foot] ??
                    player.dominant_foot)
                  : "Non renseigné"}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.scoreHero}>
          <View style={{ width: "62%" }}>
            <Text
              style={{
                fontFamily: "Helvetica-Bold",
                fontSize: 10,
                color: COLORS.violet,
                textTransform: "uppercase",
              }}
            >
              Score global d&apos;aptitude
            </Text>
            <Text style={{ fontSize: 9.5, color: COLORS.slate, marginTop: 5 }}>
              {total.complete
                ? (analysis.interpretation ??
                  "Évaluation complète validée selon le référentiel de la catégorie.")
                : `Évaluation partielle (${Math.round(total.completion_ratio * 100)} % des tests complétés) : le score global sur ${total.max_total} sera calculé une fois l'ensemble des ateliers renseignés et barémés.`}
            </Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            {total.total !== null ? (
              <Text style={styles.scoreNumber}>
                {total.total.toFixed(1)}{" "}
                <Text style={styles.scoreMax}>/ {total.max_total}</Text>
              </Text>
            ) : (
              <View style={{ alignItems: "flex-end" }}>
                <Text
                  style={{
                    fontFamily: "Helvetica-Bold",
                    fontSize: 13,
                    color: COLORS.orange,
                  }}
                >
                  Partiel : {total.partial_total.toFixed(1)} pts
                </Text>
                <Text style={{ fontSize: 8, color: COLORS.slateMuted }}>
                  Score complet en attente
                </Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Note pédagogique aux parents</Text>
          <Text style={{ fontSize: 9, lineHeight: 1.45, color: COLORS.slateMuted }}>
            Ce bilan individuel restitue de manière factuelle les performances et
            attitudes observées lors de la session du{" "}
            {formatDateFr(session.session_date)} dans la catégorie {category.label}. Il
            constitue un outil d&apos;accompagnement pédagogique au service de la
            progression de l&apos;enfant et ne représente ni un classement public, ni une
            affectation définitive à un poste, ni une prédiction de carrière.
          </Text>
        </View>

        <PageFooter
          clubName={clubName}
          footerNote={footerNote}
          playerLabel={fullName}
          pageNumber={1}
        />
      </Page>

      {/* ============================== PAGE 2 ============================== */}
      <Page size="A4" style={styles.page}>
        <View style={styles.miniHeader}>
          <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 10, color: COLORS.violet }}>
            {clubName} — Profil par domaine
          </Text>
          <Text style={{ fontSize: 9, color: COLORS.slateMuted }}>
            {fullName} ({category.label})
          </Text>
        </View>

        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 14,
          }}
        >
          <View
            style={{
              width: "48%",
              alignItems: "center",
              borderWidth: 1,
              borderColor: COLORS.border,
              borderRadius: 8,
              padding: 8,
            }}
          >
            <Text
              style={{
                fontFamily: "Helvetica-Bold",
                fontSize: 9,
                color: COLORS.violet,
                marginBottom: 4,
              }}
            >
              Équilibre des 5 domaines (base 100)
            </Text>
            <RadarSvg axes={radarAxes} />
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                justifyContent: "center",
              }}
            >
              {total.domains.map((d) => (
                <Text
                  key={d.domain}
                  style={{
                    fontSize: 7,
                    color: COLORS.slateMuted,
                    marginHorizontal: 4,
                  }}
                >
                  • {d.label.replace("Compétences ", "").replace("Capacités ", "")}:{" "}
                  {d.normalized !== null ? `${d.normalized}%` : "—"}
                </Text>
              ))}
            </View>
          </View>

          <View style={{ width: "49%" }}>
            <Text style={styles.sectionTitle}>Scores des cinq domaines</Text>
            {total.domains.map((d) => {
              const pct =
                d.points !== null
                  ? Math.min(100, Math.round((d.points / d.max_points) * 100))
                  : Math.min(
                      100,
                      Math.round((d.partial_points / d.max_points) * 100),
                    );
              return (
                <View
                  key={d.domain}
                  style={{
                    borderWidth: 1,
                    borderColor: COLORS.border,
                    borderRadius: 7,
                    padding: 8,
                    marginBottom: 7,
                    backgroundColor: COLORS.bgSoft,
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      marginBottom: 4,
                    }}
                  >
                    <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 9 }}>
                      {d.label}
                    </Text>
                    <Text
                      style={{
                        fontFamily: "Helvetica-Bold",
                        fontSize: 9,
                        color: d.points !== null ? COLORS.violet : COLORS.orange,
                      }}
                    >
                      {d.points !== null
                        ? `${d.points.toFixed(1)} / ${d.max_points}`
                        : `Incomplet (${d.tests_complete}/${d.tests_total})`}
                    </Text>
                  </View>
                  <View
                    style={{
                      height: 6,
                      backgroundColor: COLORS.border,
                      borderRadius: 3,
                    }}
                  >
                    <View
                      style={{
                        width: `${pct}%`,
                        height: 6,
                        backgroundColor:
                          d.points !== null ? COLORS.violet : COLORS.orange,
                        borderRadius: 3,
                      }}
                    />
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Résumé du profil sportif</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 8 }}>
            {analysis.profiles.map((prof) => (
              <View key={prof} style={styles.pill}>
                <Text style={styles.pillText}>{prof}</Text>
              </View>
            ))}
          </View>
          <Text style={{ fontSize: 9.5, lineHeight: 1.48, color: COLORS.slate }}>
            {analysisEnabled
              ? analysis.summary
              : "Synthèse automatique désactivée pour cette évaluation. Consultez le commentaire de l'encadrement en page 4."}
          </Text>
        </View>

        <PageFooter
          clubName={clubName}
          footerNote={footerNote}
          playerLabel={fullName}
          pageNumber={2}
        />
      </Page>

      {/* ============================== PAGE 3 ============================== */}
      <Page size="A4" style={styles.page}>
        <View style={styles.miniHeader}>
          <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 10, color: COLORS.violet }}>
            {clubName} — Détail des ateliers et résultats bruts
          </Text>
          <Text style={{ fontSize: 9, color: COLORS.slateMuted }}>
            {fullName} ({category.label})
          </Text>
        </View>

        <View style={styles.tableHeader}>
          <Text style={[styles.tableHeaderCell, { width: "18%" }]}>Atelier</Text>
          <Text style={[styles.tableHeaderCell, { width: "26%" }]}>
            Résultats bruts
          </Text>
          <Text style={[styles.tableHeaderCell, { width: "18%" }]}>
            Tentatives
          </Text>
          <Text
            style={[
              styles.tableHeaderCell,
              { width: "13%", textAlign: "right" },
            ]}
          >
            Score / Max
          </Text>
          <Text style={[styles.tableHeaderCell, { width: "25%", paddingLeft: 6 }]}>
            Observations terrain
          </Text>
        </View>

        {entries.map((entry, idx) => {
          const comps = entry.result?.components ?? [];
          const rawSummary =
            entry.evaluation_status === "absent"
              ? "Absent"
              : entry.evaluation_status === "exempt"
                ? "Dispensé"
                : comps.length > 0
                  ? comps
                      .map((c) => {
                        if (c.retained_value === null) return `${c.label}: —`;
                        return c.kind === "measured"
                          ? `${c.retained_value} ${c.unit ?? ""}`
                          : `${c.label.split(" ")[0]}: ${c.retained_value}/${c.max_points}`;
                      })
                      .join(" | ")
                  : "Non saisi";

          const attemptsText = comps
            .filter((c) => c.kind === "measured" && c.attempts.length > 1)
            .map((c) =>
              c.attempts
                .map((a, i) =>
                  a.is_valid === false
                    ? `E${i + 1}:X`
                    : a.value !== null
                      ? `E${i + 1}:${a.value}${c.unit ?? ""}`
                      : `E${i + 1}:—`,
                )
                .join(", "),
            )
            .join(" ; ");

          return (
            <View
              key={entry.test_id}
              style={[
                styles.tableRow,
                { backgroundColor: idx % 2 === 1 ? COLORS.bgSoft : COLORS.white },
              ]}
            >
              <View style={{ width: "18%" }}>
                <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 8 }}>
                  {entry.test_code} — {entry.test_name}
                </Text>
                {entry.protocol_text ? (
                  <Text style={{ fontSize: 6.8, color: COLORS.slateMuted }}>
                    {entry.protocol_text}
                  </Text>
                ) : null}
              </View>
              <Text style={[styles.tableCell, { width: "26%" }]}>{rawSummary}</Text>
              <Text
                style={[
                  styles.tableCell,
                  { width: "18%", fontSize: 7.3, color: COLORS.slateMuted },
                ]}
              >
                {attemptsText || "—"}
              </Text>
              <Text
                style={[
                  styles.tableCell,
                  {
                    width: "13%",
                    textAlign: "right",
                    fontFamily: "Helvetica-Bold",
                    color:
                      entry.result?.points !== null &&
                      entry.result?.points !== undefined
                        ? COLORS.violet
                        : COLORS.slateMuted,
                  },
                ]}
              >
                {entry.result?.points !== null && entry.result?.points !== undefined
                  ? `${entry.result.points.toFixed(1)} / ${entry.max_points}`
                  : `— / ${entry.max_points}`}
              </Text>
              <Text
                style={[
                  styles.tableCell,
                  { width: "25%", paddingLeft: 6, fontSize: 7.5 },
                ]}
              >
                {entry.comment ? entry.comment : "—"}
              </Text>
            </View>
          );
        })}

        <PageFooter
          clubName={clubName}
          footerNote={footerNote}
          playerLabel={fullName}
          pageNumber={3}
        />
      </Page>

      {/* ============================== PAGE 4 ============================== */}
      <Page size="A4" style={styles.page}>
        <View style={styles.miniHeader}>
          <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 10, color: COLORS.violet }}>
            {clubName} — Bilan pédagogique & recommandations
          </Text>
          <Text style={{ fontSize: 9, color: COLORS.slateMuted }}>
            {fullName} ({category.label})
          </Text>
        </View>

        {analysisEnabled ? (
          <>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <View
                style={[
                  styles.card,
                  {
                    width: "48.5%",
                    backgroundColor: COLORS.greenSoft,
                    borderColor: COLORS.green,
                  },
                ]}
              >
                <Text style={[styles.sectionTitle, { color: COLORS.green }]}>
                  Points forts observés
                </Text>
                {analysis.strengths.length > 0 ? (
                  analysis.strengths.map((s, idx) => (
                    <Text key={idx} style={{ fontSize: 9, marginBottom: 4 }}>
                      • {s.text}
                    </Text>
                  ))
                ) : (
                  <Text style={{ fontSize: 8.5, color: COLORS.slateMuted }}>
                    Aucun atelier n&apos;atteint encore le seuil de point fort (75 %) sur les
                    résultats disponibles.
                  </Text>
                )}
              </View>

              <View
                style={[
                  styles.card,
                  {
                    width: "48.5%",
                    backgroundColor: COLORS.orangeSoft,
                    borderColor: COLORS.orange,
                  },
                ]}
              >
                <Text style={[styles.sectionTitle, { color: COLORS.orange }]}>
                  Axes d&apos;amélioration prioritaires
                </Text>
                {analysis.improvements.length > 0 ? (
                  analysis.improvements.map((s, idx) => (
                    <Text key={idx} style={{ fontSize: 9, marginBottom: 4 }}>
                      • {s.text}
                    </Text>
                  ))
                ) : (
                  <Text style={{ fontSize: 8.5, color: COLORS.slateMuted }}>
                    Aucun atelier sous le seuil prioritaire (50 %) parmi les tests
                    évalués.
                  </Text>
                )}
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>
                Recommandations d&apos;entraînement ({category.label})
              </Text>
              {analysis.recommendations.length > 0 ? (
                analysis.recommendations.map((rec, idx) => (
                  <Text
                    key={idx}
                    style={{ fontSize: 9.2, marginBottom: 5, lineHeight: 1.4 }}
                  >
                    {idx + 1}. {rec}
                  </Text>
                ))
              ) : (
                <Text style={{ fontSize: 9, color: COLORS.slateMuted }}>
                  Poursuivre un travail régulier et équilibré sur l&apos;ensemble des ateliers.
                </Text>
              )}
            </View>
          </>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Appréciation de l&apos;encadrement</Text>
          <Text style={{ fontSize: 9.5, lineHeight: 1.45, color: COLORS.slate }}>
            {coachComment && coachComment.trim().length > 0
              ? coachComment
              : "Aucune observation complémentaire de synthèse renseignée."}
          </Text>
        </View>

        <View
          style={{
            marginTop: 12,
            borderWidth: 1,
            borderColor: COLORS.violet,
            borderRadius: 8,
            padding: 12,
            flexDirection: "row",
            justifyContent: "space-between",
          }}
        >
          <View style={{ width: "58%" }}>
            <Text style={styles.fieldLabel}>Validation pédagogique</Text>
            <Text style={styles.fieldValue}>{signatory}</Text>
            <Text style={{ fontSize: 8.5, color: COLORS.slateMuted, marginTop: 3 }}>
              Statut :{" "}
              {stored_score?.validated_at
                ? `Évaluation validée le ${formatDateFr(stored_score.validated_at)}`
                : "Document généré avant validation finale de la session"}
            </Text>
          </View>
          <View style={{ width: "38%", alignItems: "flex-end" }}>
            <Text style={styles.fieldLabel}>Date d&apos;édition du rapport</Text>
            <Text style={styles.fieldValue}>{formatDateFr(generatedAtIso)}</Text>
            <Text style={{ fontSize: 8, color: COLORS.slateMuted, marginTop: 8 }}>
              Cachet & visa {clubName}
            </Text>
          </View>
        </View>

        <PageFooter
          clubName={clubName}
          footerNote={footerNote}
          playerLabel={fullName}
          pageNumber={4}
        />
      </Page>
    </Document>
  );
}

/**
 * Génère le buffer binaire PDF prêt à être stocké dans Supabase Storage (bucket privé `reports`).
 */
export async function generatePlayerReportPdfBuffer(
  props: ReportRenderProps,
): Promise<Buffer> {
  const element = <AssessmentReportDocument {...props} />;
  return renderToBuffer(element);
}
