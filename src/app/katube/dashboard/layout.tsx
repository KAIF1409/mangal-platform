import type { Metadata } from "next";
import DashboardThemeShell from "./DashboardThemeShell";

export const metadata: Metadata = {
  title: "KaTube — Creator Dashboard",
  description:
    "Manage your KaTube channel connection and view your video stats on MANGAL.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  // Sidebar + theme (forced-dark maroon/red by default, light optional —
  // see DashboardThemeShell) split into its own client component so this
  // layout file can stay a server component and keep the `metadata`
  // export above working.
  return <DashboardThemeShell>{children}</DashboardThemeShell>;
}
