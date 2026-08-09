import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Grievance Officer",
  description:
    "Contact MANGAL's Grievance Officer as required under India's IT Rules 2021.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
