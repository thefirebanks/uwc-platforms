import type { Metadata } from "next";
import { DM_Sans, Newsreader } from "next/font/google";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v16-appRouter";
import { AppThemeProvider } from "@/components/app-theme-provider";
import { ErrorBoundary } from "@/components/error-boundary";
import "./globals.css";

const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-newsreader",
  weight: ["400", "500"],
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["400", "500", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "UWC Peru Selection Platform",
  description: "Plataforma de selección UWC Perú — gestión de postulaciones, validaciones y etapas",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body suppressHydrationWarning className={`${newsreader.variable} ${dmSans.variable}`}>
        <AppRouterCacheProvider options={{ key: "mui", enableCssLayer: true }}>
          <AppThemeProvider>
            <ErrorBoundary>{children}</ErrorBoundary>
          </AppThemeProvider>
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}
