import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Parental Consent",
  description: "Parental consent verification for MANGAL minor accounts.",
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
