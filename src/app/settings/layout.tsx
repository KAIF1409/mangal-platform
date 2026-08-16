import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Settings",
  description:
    "Manage your account settings on MANGAL.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
