import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Become a Creator",
  description:
    "Start publishing manga, comics and web novels on MANGAL — 0% platform cut.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
