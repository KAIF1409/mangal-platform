import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin — Migrate Media",
  description: "One-time backlog migration of old Supabase-hosted media into R2.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
