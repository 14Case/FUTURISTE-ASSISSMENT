import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppProviders } from "@/components/providers/app-providers";

export const metadata: Metadata = {
  title: {
    default: "FUTURISTE ASSESSMENT — FUTURISTE ACADÉMIE FC",
    template: "%s | FUTURISTE ASSESSMENT",
  },
  description:
    "Plateforme d'évaluation sportive terrain, d'analyse de profils et de génération de rapports individuels — FUTURISTE ACADÉMIE FC.",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "FAFC Éval",
  },
  icons: {
    icon: "/brand/icon-192.svg",
    apple: "/brand/icon-192.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#5B21B6",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body className="min-h-screen antialiased">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
