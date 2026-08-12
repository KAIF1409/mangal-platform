import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Search Results",
  description:
    "Search manga, comics and web novels by title, genre, or creator on MANGAL.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
