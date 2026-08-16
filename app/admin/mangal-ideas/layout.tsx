import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin — Mangal Ideas",
  description: "Manage company idea cards for the Mangal Ideas feed on KaTube home.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
