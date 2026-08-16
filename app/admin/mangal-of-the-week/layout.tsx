import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin — Mangal of the Week",
  description: "Snapshot the weekly top-20 pool, finalize scoring/ranking, and set prize notes.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
