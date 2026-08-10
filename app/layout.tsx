import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import ConsentBanner from "./components/ConsentBanner";
import { Analytics } from "@vercel/analytics/react";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl = "https://mangal-platform.vercel.app";
const siteDescription = "Read and publish India's best manga, comics and web novels — one account, both content types, 0% platform cut for creators.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "MANGAL — India's Manga & Novel Platform",
    template: "%s | MANGAL",
  },
  description: siteDescription,
  openGraph: {
    title: "MANGAL — India's Manga & Novel Platform",
    description: siteDescription,
    url: siteUrl,
    siteName: "MANGAL",
    images: [
      {
        url: "/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "MANGAL — Read and publish manga, comics and web novels",
      },
    ],
    locale: "en_IN",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "MANGAL — India's Manga & Novel Platform",
    description: siteDescription,
    images: ["/og-image.jpg"],
  },
  // No manual `icons` override here — Next.js auto-detects app/icon.png and
  // app/apple-icon.png (already in the repo) and serves those directly.
  // The previous version forced everything to favicon.ico instead, which
  // meant the sharper PNG icons were never actually used.
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* Runs before paint so the saved theme applies immediately —
            avoids a flash of the wrong theme on load. White/light is now
            the default; dark only applies if the user explicitly chose it
            AFTER the light-default redesign shipped.

            Migration note: browsers that saved 'dark' before this redesign
            existed would otherwise be stuck on dark forever (that old value
            was never a real choice under the current design, it was just
            whatever the old dark-only build wrote). mangal_theme_migrated_v1
            runs this reset exactly once per browser, then gets out of the way. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(!localStorage.getItem('mangal_theme_migrated_v1')){localStorage.removeItem('mangal_theme');localStorage.setItem('mangal_theme_migrated_v1','1');}var t=localStorage.getItem('mangal_theme');if(t!=='dark'){document.documentElement.setAttribute('data-theme','light');}}catch(e){document.documentElement.setAttribute('data-theme','light');}`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        {children}
        <ConsentBanner />
        <Analytics />
      </body>
    </html>
  );
}