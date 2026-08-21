import type { Metadata } from "next";
import KatubeStudioShell from "./KatubeStudioShell";

export const metadata: Metadata = {
  title: "KaTube Studio — MANGAL",
  description: "Channel analytics, content, comments, and channel setup for your KaTube channel.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <KatubeStudioShell>{children}</KatubeStudioShell>;
}
