import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import { GooseMark } from "@/components/GooseMark";
import { getOptionalUser } from "@/lib/auth/current";
import { siteUrl } from "@/lib/site";

const SITE_URL = siteUrl();

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Honk — see who's in your classes",
    template: "%s · Honk",
  },
  description:
    "Paste your Quest schedule and see who else is in your classes, and when you and your friends are free at the same time. University of Waterloo only.",
  applicationName: "Honk",
  openGraph: {
    type: "website",
    siteName: "Honk",
    title: "Honk — see who's in your classes",
    description:
      "Paste your Quest schedule and find out who else is in it. University of Waterloo only.",
    url: SITE_URL,
  },
  twitter: {
    card: "summary_large_image",
    title: "Honk — see who's in your classes",
    description:
      "Paste your Quest schedule and find out who else is in it. University of Waterloo only.",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FDFBF6" },
    { media: "(prefers-color-scheme: dark)", color: "#1A1917" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getOptionalUser();

  return (
    <html lang="en">
      <body className="min-h-dvh">
        <header className="border-b border-[var(--border)]">
          <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-4 px-5">
            <Link
              href={user ? "/home" : "/"}
              className="flex items-center gap-2 rounded-lg"
              aria-label="Honk, home"
            >
              <GooseMark className="text-[var(--clay)]" />
              <span className="text-[17px] font-semibold tracking-[-0.02em]">Honk</span>
            </Link>

            <nav className="flex items-center gap-1 text-[14px]">
              {user ? (
                <>
                  <Link href="/home" className="btn btn-quiet">
                    Home
                  </Link>
                  <Link href="/settings" className="btn btn-quiet">
                    Settings
                  </Link>
                </>
              ) : (
                <Link href="/signin" className="btn btn-quiet">
                  Sign in
                </Link>
              )}
            </nav>
          </div>
        </header>

        <main className="mx-auto max-w-3xl px-5 py-8 sm:py-12">{children}</main>

        <footer className="mx-auto max-w-3xl px-5 pb-10 pt-4">
          <hr className="hairline" />
          <p className="mt-4 text-[13px] text-[var(--ink-faint)]">
            Honk is not affiliated with the University of Waterloo. Your schedule is only
            visible to people you have added.
          </p>
          <p className="mt-2 text-[13px] text-[var(--ink-faint)]">
            Made by{" "}
            <a
              href="https://adarshthoduvakkal.com"
              target="_blank"
              rel="noreferrer"
              className="underline-offset-2 hover:text-[var(--clay)] hover:underline"
            >
              Adarsh Thoduvakkal
            </a>
            .
          </p>
        </footer>
      </body>
    </html>
  );
}
