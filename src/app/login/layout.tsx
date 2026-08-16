import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign In",
  description:
    "Sign in or create an account on MANGAL.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
