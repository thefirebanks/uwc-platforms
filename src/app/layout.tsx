import type { Metadata } from "next";
import { Newsreader, Inter } from "next/font/google";
import { AppThemeProvider } from "@/components/app-theme-provider";
import "./globals.css";

const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-newsreader",
  weight: ["400", "500"],
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "UWC Peru Selection Platform",
  description: "MVP para postulaciones, validación y gestión de etapas",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body suppressHydrationWarning className={`${newsreader.variable} ${inter.variable}`}>
        <AppThemeProvider>{children}</AppThemeProvider>
      </body>
    </html>
  );
}
