import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { getKeyStatus } from "../server/runtime";

export const metadata: Metadata = { title: "Council", description: "Ask a council of AI advisors." };
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const status = await getKeyStatus();
  return (
    <html lang="en">
      <body>
        <header className="border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
            <Link href="/" className="font-semibold tracking-tight">
              Council
            </Link>
            <nav className="flex gap-4 text-sm text-zinc-600 dark:text-zinc-400">
              <Link href="/" className="hover:text-zinc-900 dark:hover:text-zinc-100">Ask</Link>
              <Link href="/sessions" className="hover:text-zinc-900 dark:hover:text-zinc-100">History</Link>
              <Link href="/briefs" className="hover:text-zinc-900 dark:hover:text-zinc-100">Briefs</Link>
            </nav>
            {status.ok && status.fake && (
              <span
                title="COUNCIL_FAKE=1: no API calls, canned answers, separate database"
                className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
              >
                Offline fake mode
              </span>
            )}
          </div>
        </header>
        {!status.ok && (
          <div role="alert" className="border-b border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/40">
            <div className="mx-auto max-w-6xl px-4 py-3 text-sm text-red-800 dark:text-red-300">
              <p className="font-semibold">The Anthropic API key isn&apos;t working, so the council can&apos;t run.</p>
              <p className="mt-1">{status.error}</p>
              <p className="mt-1">
                Put <code>ANTHROPIC_API_KEY=...</code> in <code>.env.local</code> in the project folder, using a key from console.anthropic.com
                (a Claude.ai subscription won&apos;t work), then restart <code>npm run dev</code>.
              </p>
            </div>
          </div>
        )}
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
