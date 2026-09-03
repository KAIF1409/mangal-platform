import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { absolute: "Upload | MANGAL" },
  description:
    "Publish a new chapter on MANGAL.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
