import type { Metadata } from "next";
import StudioSidebar from "../../components/shared/StudioSidebar";

export const metadata: Metadata = {
  title: "KaTube — Creator Dashboard",
  description:
    "Manage your KaTube channel connection and view your video stats on MANGAL.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <StudioSidebar />
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}
