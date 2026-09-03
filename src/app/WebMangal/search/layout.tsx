import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { absolute: "Search Results | MANGAL" },
  description:
    "Search manga, comics and web novels by title, genre, or creator on MANGAL.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
