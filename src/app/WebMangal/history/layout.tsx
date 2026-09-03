import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { absolute: "Reading History | MANGAL" },
  description:
    "Your reading history and progress on MANGAL.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
