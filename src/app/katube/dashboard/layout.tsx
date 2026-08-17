import type { Metadata } from "next";
import StudioSidebar from "../../components/shared/StudioSidebar";

export const metadata: Metadata = {
  title: "KaTube — Creator Dashboard",
  description:
    "Manage your KaTube channel connection and view your video stats on MANGAL.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  // Same fix as app/dashboard/layout.tsx — StudioSidebar now renders its own
  // full-width mobile top bar below 900px, so this row layout needs to
  // become a column at that breakpoint too.
  return (
    <div className="mg-dashboard-shell" style={{ display: "flex", minHeight: "100vh" }}>
      <style>{`
        @media (max-width: 900px) {
          .mg-dashboard-shell { flex-direction: column; }
        }
      `}</style>
      <StudioSidebar />
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}
