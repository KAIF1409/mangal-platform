'use client';

import ComingSoonGate from '../components/shared/ComingSoonGate';

export default function KalpanaCircleLayout({ children }: { children: React.ReactNode }) {
  return <ComingSoonGate label="Kalpana Circle">{children}</ComingSoonGate>;
}
