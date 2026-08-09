import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin — Reports",
  description:
    "Content moderation reports on MANGAL.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
