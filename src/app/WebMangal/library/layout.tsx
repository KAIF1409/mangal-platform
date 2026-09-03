import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { absolute: "Library | MANGAL" },
  description:
    "Series you follow on MANGAL.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
