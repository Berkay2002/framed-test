import HeaderAuth from "@/components/header-auth";
import ThemeSwitcher from "@/components/theme-switcher";
import { Geist } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import Link from "next/link";
import "./globals.css";

const defaultUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "http://localhost:3000";

export const metadata = {
  metadataBase: new URL(defaultUrl),
  title: "Framed",
  description: "A social deduction game where the impostor doesn't know they're lying.",
};

const geistSans = Geist({
  display: "swap",
  subsets: ["latin"],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={geistSans.className} suppressHydrationWarning>
      <body className="bg-background text-foreground">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <div className="min-h-screen flex flex-col">
            {/* Navigation */}
            <nav className="w-full flex justify-center border-b border-border h-16 bg-background">
              <div className="w-full max-w-5xl flex justify-between items-center p-3 px-5 text-sm">
                <div className="flex gap-5 items-center font-semibold">
                  <Link href={"/"}>Framed</Link>
                </div>
                <HeaderAuth />
              </div>
            </nav>

            {/* Main Content */}
            <main className="flex-1 flex flex-col items-center">
              <div className="w-full max-w-5xl px-5 py-12">
                {children}
              </div>
            </main>

            {/* Footer */}
            <footer className="w-full border-t border-border bg-background/90">
              <div className="max-w-5xl mx-auto px-5 py-4 flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  © 2025 Framed. No rights reserved.
                </p>
                <ThemeSwitcher />
              </div>
            </footer>
          </div>
          <Toaster
            richColors
            position="top-center"
            toastOptions={{
              style: {
                background: 'hsl(var(--background))',
                color: 'hsl(var(--foreground))',
                border: '1px solid hsl(var(--border))',
              },
              className: 'game-toast',
              duration: 3000,
            }}
          />
        </ThemeProvider>
      </body>
    </html>
  );
}
