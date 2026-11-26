import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FUTURISTE ASSESSMENT — FUTURISTE ACADÉMIE FC",
    short_name: "FAFC Éval",
    description:
      "Application d'évaluation terrain, d'analyse sportive et de reporting individuel de FUTURISTE ACADÉMIE FC.",
    start_url: "/tableau-de-bord",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#FFFFFF",
    theme_color: "#5B21B6",
    lang: "fr",
    categories: ["sports", "education", "productivity"],
    icons: [
      {
        src: "/brand/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/brand/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
