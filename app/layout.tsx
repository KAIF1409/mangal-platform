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
            avoids a flash of the wrong theme on load. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('mangal_theme');if(t==='light'){document.documentElement.setAttribute('data-theme','light');}}catch(e){}`,
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