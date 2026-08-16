import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Bookmarks",
  description:
    "Your saved manga, comics and web novels on MANGAL.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
