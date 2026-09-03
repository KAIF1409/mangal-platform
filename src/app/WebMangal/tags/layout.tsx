import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { absolute: "Browse by Tag | MANGAL" },
  description: "Discover manga, comics and web novels on MANGAL by tag — Reincarnation, System, Weak to Strong, and more.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
