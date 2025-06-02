//import { ThemeProvider } from "next-themes";
import { ThemeProviderWrapper } from "@/components/themeProviderWrapper";
import { Toaster } from "sonner";
import { Geist } from "next/font/google";
import { NavBar } from "@/components/ui/navbar";
import { Footer } from "@/components/ui/footer";
import { GameBackground } from "@/components/ui/background";
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
      <body className="bg-background text-foreground overflow-x-hidden">
        <ThemeProviderWrapper>
          {/* Game Background */}
          <GameBackground />
          
          <div className="min-h-screen flex flex-col overflow-hidden relative">
            {/* Navigation */}
            <NavBar />

            {/* Main Content */}
            <main className="flex-1 flex flex-col w-full">
              {children}
            </main>

            {/* Footer */}
            <Footer />
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
              duration: 2000,
            }}
          />
        </ThemeProviderWrapper>
      </body>
    </html>
  );
}
