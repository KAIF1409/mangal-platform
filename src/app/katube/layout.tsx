// KaTube is now open to browse — the whole-route ComingSoonGate that used
// to sit here has been removed. Only the actions that actually touch
// unfinished/unmoderated write-paths (uploading a video, setting up a
// channel/profile) stay gated, at the point of that action itself —
// see src/app/katube/upload/page.tsx.
export default function KaTubeLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
