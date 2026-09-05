'use client';

import ComingSoonGate from '../components/shared/ComingSoonGate';

export default function KaTubeLayout({ children }: { children: React.ReactNode }) {
  return <ComingSoonGate label="KaTube">{children}</ComingSoonGate>;
}
