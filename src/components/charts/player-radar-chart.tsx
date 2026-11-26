"use client";

import * as React from "react";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import type { DomainResult } from "@/lib/scoring/types";

export function PlayerRadarChart({ domains }: { domains: DomainResult[] }) {
  const data = domains.map((d) => ({
    subject: d.label
      .replace("Compétences ", "")
      .replace("Capacités ", "")
      .replace("Intelligence de jeu", "Intelligence"),
    normalise: d.normalized ?? 0,
    brut: d.points !== null ? `${d.points}/${d.max_points}` : "Incomplet",
  }));

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} outerRadius="72%">
          <PolarGrid stroke="#cbd5e1" />
          <PolarAngleAxis
            dataKey="subject"
            tick={{ fill: "#334155", fontSize: 12, fontWeight: 600 }}
          />
          <PolarRadiusAxis
            angle={90}
            domain={[0, 100]}
            tick={{ fill: "#64748b", fontSize: 10 }}
          />
          <Radar
            name="Score normalisé (/100)"
            dataKey="normalise"
            stroke="#5B21B6"
            strokeWidth={2.5}
            fill="#7DD3FC"
            fillOpacity={0.5}
          />
          <Tooltip
            formatter={(value) => [`${value} %`, "Niveau normalisé"]}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DomainBarsChart({ domains }: { domains: DomainResult[] }) {
  const data = domains.map((d) => ({
    name: d.label
      .replace("Compétences ", "")
      .replace("Capacités ", "")
      .replace("Intelligence de jeu", "Intelligence"),
    points: d.points ?? d.partial_points,
    max: d.max_points,
    pct:
      d.points !== null
        ? Math.round((d.points / d.max_points) * 100)
        : Math.round((d.partial_points / d.max_points) * 100),
  }));

  return (
    <div className="h-68 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 10, right: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis type="number" domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} />
          <YAxis
            dataKey="name"
            type="category"
            width={100}
            tick={{ fontSize: 12, fontWeight: 600 }}
          />
          <Tooltip
            formatter={(value, _name, item) => [
              `${item.payload.points} / ${item.payload.max} pts (${value} %)`,
              "Domaine",
            ]}
          />
          <Bar dataKey="pct" fill="#5B21B6" radius={[0, 8, 8, 0]} barSize={22} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
