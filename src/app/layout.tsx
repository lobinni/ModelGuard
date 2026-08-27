import type { Metadata } from "next";
import { IBM_Plex_Mono, Space_Grotesk } from "next/font/google";
import type { ReactNode } from "react";

import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});

const SITE_NAME = "ModelGuard AI";
const SITE_DESCRIPTION =
  "Register AI model architectures, training pipelines and agent blueprints on GenLayer Studionet after an LLM-backed semantic originality audit that every validator replays in consensus.";

export const metadata: Metadata = {
  title: {
    default: `${SITE_NAME} — Semantic IP Registry on GenLayer`,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  creator: SITE_NAME,
  publisher: SITE_NAME,
  keywords: [
    "GenLayer",
    "intelligent contract",
    "AI model registry",
    "semantic audit",
    "Studionet",
    "consensus",
  ],
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: `${SITE_NAME} — Semantic IP Registry on GenLayer`,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: "summary",
    title: `${SITE_NAME} — Semantic IP Registry on GenLayer`,
    description: SITE_DESCRIPTION,
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${plexMono.variable}`}>
      <body className="bg-[#030812] font-sans text-slate-200 antialiased">
        {children}
      </body>
    </html>
  );
}
