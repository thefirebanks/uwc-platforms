"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { type AppLanguage, type MessageKey, translateMessage } from "@/lib/i18n/messages";

const LANGUAGE_STORAGE_KEY = "uwc:dashboard-language";

type LanguageContextValue = {
  canUseEnglish: boolean;
  language: AppLanguage;
  setLanguage: (language: AppLanguage) => void;
  t: (key: MessageKey, params?: Record<string, string | number>) => string;
};

const LanguageContext = createContext<LanguageContextValue>({
  canUseEnglish: false,
  language: "es",
  setLanguage: () => undefined,
  t: (key, params) => translateMessage("es", key, params),
});

export function LanguageProvider({
  canUseEnglish,
  children,
}: {
  canUseEnglish: boolean;
  children: React.ReactNode;
}) {
  const [storedLanguage, setStoredLanguage] = useState<AppLanguage>(() => {
    if (typeof window === "undefined") {
      return "es";
    }

    const saved = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return saved === "es" || saved === "en" ? saved : "es";
  });

  const language: AppLanguage = canUseEnglish ? storedLanguage : "es";

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const value = useMemo<LanguageContextValue>(() => {
    const setLanguage = (nextLanguage: AppLanguage) => {
      if (!canUseEnglish) {
        return;
      }

      setStoredLanguage(nextLanguage);
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguage);
    };

    return {
      canUseEnglish,
      language,
      setLanguage,
      t: (key, params) => translateMessage(language, key, params),
    };
  }, [canUseEnglish, language]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useAppLanguage() {
  return useContext(LanguageContext);
}
