import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Parental Consent",
  description:
    "Parental consent confirmation for MANGAL minor accounts.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
