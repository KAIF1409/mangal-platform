import { BadgeCheck } from 'lucide-react';

// §27 item 9 — Verified badge. Signal is the existing
// `creator_profiles.verified_youtube_channel_id` column (channel-ownership
// verification, §6/§10) — "verified" here means "verified their YouTube
// channel", not a separate new verification flow. Deliberately just a
// visual badge component, no new table/migration.
export default function VerifiedBadge({ size = 15 }: { size?: number }) {
  return (
    <span
      title="Verified channel"
      style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}
    >
      <BadgeCheck size={size} strokeWidth={2.5} color="#2563eb" fill="rgba(37,99,235,0.18)" />
    </span>
  );
}
