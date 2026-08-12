import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Browse",
  description:
    "Browse manga, comics and web novels by genre, language and more on MANGAL.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
