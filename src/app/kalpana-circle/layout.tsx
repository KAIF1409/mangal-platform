// Kalpana Circle is now open to browse — the whole-route ComingSoonGate
// that used to sit here has been removed. Only the actions that actually
// touch unfinished/unmoderated write-paths (posting, adding a story,
// setting up a profile) stay gated, at the point of that action itself —
// see submitPost/uploadStory in page.tsx and src/app/kalpana-circle/settings/page.tsx.
export default function KalpanaCircleLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
