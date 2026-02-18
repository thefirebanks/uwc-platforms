import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";
import { AppThemeProvider } from "@/components/app-theme-provider";
import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
});

export const metadata: Metadata = {
  title: "UWC Peru Selection Platform",
  description: "MVP para postulaciones, validación y gestión de etapas",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body suppressHydrationWarning className={dmSans.variable}>
        <AppThemeProvider>{children}</AppThemeProvider>
      </body>
    </html>
  );
}
