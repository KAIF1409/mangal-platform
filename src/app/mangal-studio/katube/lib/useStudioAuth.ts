'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import type { User } from '@supabase/supabase-js';
import { setPostLoginRedirect } from '../../../lib/auth/authRedirect';

// Same auth-gate pattern used by every other Studio/dashboard page
// (see katube/dashboard/page.tsx) — factored out so the five KaTube
// Studio tabs (Overview/Content/Analytics/Comments/Channel setup) don't
// each re-implement it.
export function useStudioAuth(currentPath: string) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        setPostLoginRedirect(currentPath);
        window.location.href = '/login?next=' + encodeURIComponent(currentPath);
        return;
      }
      setUser(data.user);
      setLoading(false);
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { user, loading };
}
