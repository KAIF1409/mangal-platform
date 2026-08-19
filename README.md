# MANGAL

**Live app:** [mangal-platform.cloudflare.app]([https://mangal-platform.vercel.app](https://mangal-platform.mangak.workers.dev/))

MANGAL is an Indian platform built for people who love manga, comics, web
novels, and anime — a place to read, watch, and hang out with a community that
loves the same stuff.

It has **three parts** that work together:

### 1. WebMangal — read manga, comics & novels
The original MANGAL. Anyone can create an account and start reading manga,
comics, and web novels for free. Writers and artists can also publish their
own original work here — chapters, covers, updates — directly to readers,
without needing a publisher.

### 2. KaTube — a video feed for AI-made anime
A YouTube-style feed made specifically for **AI-generated anime videos**.
The idea: a MANGAL creator who has written a series can use AI video tools to
bring a scene from their own story to life as a short anime-style clip, then
share it here. People browse and discover these videos the same way they'd
scroll YouTube Shorts or Instagram Reels — except everything is home-grown,
original content, not reposted or pirated anime.

### 3. Kalpana Circle — the community space
"Kalpana" means *imagination* in Hindi. This is the social side of MANGAL —
think Instagram and Discord mixed together. People can post, share
disappearing stories (including a "Close Friends" mode so only chosen people
can see certain stories), chat one-on-one or in groups, and follow their
favourite creators. It's built as the reason people come back every day, not
just when there's a new chapter or video to check out.

**The idea connecting all three:** *MANGAL writes the story. KaTube brings it
to life. Kalpana Circle is where the fans gather to talk about it.*

## Why it works

- **Zero-cost, legally clean video model.** KaTube never hosts or stores any
  video files itself — it only stores a link to the video and plays it
  through YouTube's own player. That means no server/bandwidth costs even at
  scale, and no copyright risk, because every video is original content made
  by the creator who owns the story it's based on — never pirated or reposted
  anime.
- **One account, three products.** A reader on WebMangal is already a
  potential viewer on KaTube and a potential community member on Kalpana
  Circle. Each product feeds the other two instead of competing for the same
  attention, which is rare — most platforms have to build an audience three
  separate times.
- **Creator-first, not platform-first.** Money and audience flow to the
  creator (views/revenue on their own YouTube channel, followers on their own
  profile) rather than being locked inside MANGAL. That makes it easy for
  creators to join without giving anything up, which is how a platform grows
  fast in its early days.
- **Built for an underserved audience.** Indian manga/novel/anime fans
  currently split their time across global apps (Webtoon, Tapas, YouTube,
  Discord, Instagram) with no single home that understands the local
  audience. MANGAL is positioned to be that home.

## How it connects to the global market

The manga/webtoon/anime fan base is a genuinely global one — the same
audience already exists in the US, Southeast Asia, Latin America, and Europe,
not just India. MANGAL's model is built to travel beyond India for a few
reasons:

- **Anime and manga fandom has no borders.** The content categories (manga,
  web novels, anime) already have massive global audiences on platforms like
  Webtoon, Crunchyroll, and MyAnimeList — MANGAL is entering a proven market,
  not creating a new one.
- **The zero-cost video architecture scales globally without extra
  infrastructure spend**, since KaTube rides on YouTube's global
  infrastructure instead of MANGAL having to build or pay for its own
  video-hosting/CDN as it expands to new countries.
- **The three-in-one structure (read, watch, socialize) is a differentiator
  internationally too** — most competitors are single-purpose (Webtoon only
  reads, YouTube only watches, Discord only socializes). A platform that
  does all three under one account is a stronger, stickier product anywhere
  in the world, not just in India.
- **India-first is a deliberate go-to-market strategy, not a ceiling** —
  proving the model with a large, currently underserved home audience first,
  then expanding outward once the product and community are proven, is the
  same playbook platforms like Webtoon (Korea → global) and TikTok
  (China → global) used.

## What's next

- **Multi-language support.** Right now MANGAL runs in one language. Adding
  support for multiple languages — Indian regional languages (Hindi, Tamil,
  Telugu, Bengali, and more) as well as major international ones — is one of
  the biggest planned steps. Language is one of the main walls that keeps a
  platform local: a reader in Chennai, a reader in Tokyo, and a reader in
  Mexico City can all enjoy the same story if it's not locked to one
  language. This single change opens the platform to both underserved
  Indian-language readers and international audiences at the same time.
- **Reader-to-creator monetization** — tips and unlocking premium chapters,
  so creators can earn directly from MANGAL, not just from YouTube views.
- **Platform-side sponsorships on KaTube**, once there's enough viewer
  traffic to make it worthwhile.

Both of the monetization steps above are intentionally gated behind
audience growth first — grow readers and viewers, then turn on ways to earn.

## Who it's for

- **Readers** who want free, easy access to manga, comics, and novels made by
  Indian creators.
- **Writers and artists** who want a place to publish their work directly to
  an audience.
- **Anime fans** who want to discover original AI-made anime content and talk
  about it with a community, instead of just watching pirated clips.

## Development

```bash
npm install
cp .env.example .env.local   # fill in real values
npm run dev
```

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the pre-commit checks, and
[`docs/REPO_STRUCTURE.md`](docs/REPO_STRUCTURE.md) for how the codebase is
organized.

## Who built it

Built solo — design, backend, and frontend all handled by one person —
by **Mohammed Kaif**, a B.Tech CSE student at PES University (Class of 2026).

[LinkedIn](https://www.linkedin.com/in/mohammed-kaif-714a79242) ·
[Email](mailto:kaifmohammed.work@gmail.com)
