import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
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

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common");
  return {
    title: t("brand"),
    description: t("metaDescription"),
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f5fa" },
    { media: "(prefers-color-scheme: dark)", color: "#070b16" },
  ],
  colorScheme: "light dark",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} className="bg-background" suppressHydrationWarning>
      <body
        className={`${orbitSans.variable} ${orbitMono.variable} antialiased`}
        suppressHydrationWarning
      >
        <NextIntlClientProvider locale={locale} messages={messages}>
          <AppProviders>{children}</AppProviders>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
