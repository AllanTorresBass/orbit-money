import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppProviders } from "@/components/providers/app-providers";
import "./globals.css";

const orbitSans = Geist({
  subsets: ["latin"],
  variable: "--font-orbit-sans",
});

const orbitMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-orbit-mono",
});

export const metadata: Metadata = {
  title: "Orbit",
  description: "What you can spend today.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f5fa" },
    { media: "(prefers-color-scheme: dark)", color: "#070b16" },
  ],
  colorScheme: "light dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="bg-background" suppressHydrationWarning>
      <body
        className={`${orbitSans.variable} ${orbitMono.variable} antialiased`}
        suppressHydrationWarning
      >
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
