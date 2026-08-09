import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Creator Dashboard",
  description:
    "Manage your series, chapters and stats on MANGAL.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
