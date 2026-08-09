import type { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";

type Props = {
  children: React.ReactNode;
  params: Promise<{ username: string }>;
};

const fallback: Metadata = {
  title: "Creator",
  description: "Discover creators publishing manga, comics and web novels on MANGAL.",
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  const decoded = decodeURIComponent(username);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return fallback;

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    // creator_profiles only stores user_id + username today (see page.tsx) —
    // no bio/avatar_url column yet. Just confirm the profile exists so we
    // don't title a 404 page "username — Creator"; once bio/avatar_url are
    // added, pull them in here for a richer share card.
    const { data: creatorRow } = await supabase
      .from("creator_profiles")
      .select("username")
      .ilike("username", decoded)
      .maybeSingle();

    if (!creatorRow) return fallback;

    const title = `${creatorRow.username} — Creator`;
    const description = `Read manga, comics and web novels by ${creatorRow.username} on MANGAL.`;

    return {
      title,
      description,
      openGraph: { title, description, type: "profile" },
      twitter: { card: "summary", title, description },
    };
  } catch {
    return fallback;
  }
}

export default function CreatorLayout({ children }: Props) {
  return children;
}
