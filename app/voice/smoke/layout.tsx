import type { Metadata } from "next";
import type { ReactNode } from "react";

/** Temporary Milestone A smoke route — keep it out of search indexes. */
export const metadata: Metadata = {
  title: "Voice smoke",
  robots: { index: false, follow: false },
};

export default function VoiceSmokeLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
