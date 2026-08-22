import type { Metadata } from "next";
import WebMangalStudioShell from "./WebMangalStudioShell";

export const metadata: Metadata = {
  title: "WebMangal Studio — MANGAL",
  description: "Creator analytics for your WebMangal series and chapters.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <WebMangalStudioShell>{children}</WebMangalStudioShell>;
}
