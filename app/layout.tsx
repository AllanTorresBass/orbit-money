import type { Metadata } from "next";
import { DM_Sans, Literata } from "next/font/google";
import { AppProviders } from "@/components/providers/app-providers";
import "./globals.css";

const orbitSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-orbit-sans",
});

const orbitSerif = Literata({
  subsets: ["latin"],
  variable: "--font-orbit-serif",
});

export const metadata: Metadata = {
  title: "Orbit",
  description: "What you can spend today.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${orbitSans.variable} ${orbitSerif.variable} antialiased`}>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
