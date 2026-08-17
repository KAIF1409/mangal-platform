import type { Metadata } from "next";
import StudioSidebar from "../components/shared/StudioSidebar";

export const metadata: Metadata = {
  title: "Creator Dashboard",
  description:
    "Manage your series, chapters and stats on MANGAL.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  // Mobile fix: this was a fixed-row flex (sidebar | content) with no
  // breakpoint of its own. That was fine while the sidebar just disappeared
  // below 900px (nothing left to lay out), but now that StudioSidebar
  // renders its own full-width mobile top bar in that gap, the row layout
  // needs to become a column below 900px so the bar sits above the content
  // instead of squeezed into a sliver beside it.
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
