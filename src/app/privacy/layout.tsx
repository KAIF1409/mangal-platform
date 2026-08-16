import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "MANGAL's privacy policy and data protection practices under India's DPDP Act 2023.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
