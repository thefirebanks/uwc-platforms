"use client";

import { createContext, useContext, useEffect, useMemo, useSyncExternalStore } from "react";
import { type AppLanguage, type MessageKey, translateMessage } from "@/lib/i18n/messages";

const LANGUAGE_STORAGE_KEY = "uwc:dashboard-language";
const LANGUAGE_STORAGE_EVENT = "uwc:dashboard-language-changed";

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

function readStoredLanguage(): AppLanguage {
  if (typeof window === "undefined") {
    return "es";
  }

  const saved = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  return saved === "es" || saved === "en" ? saved : "es";
}

function subscribeToLanguageChanges(onStoreChange: () => void) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const onStorage = (event: StorageEvent) => {
    if (event.key === LANGUAGE_STORAGE_KEY) {
      onStoreChange();
    }
  };
  const onLocalUpdate = () => onStoreChange();

  window.addEventListener("storage", onStorage);
  window.addEventListener(LANGUAGE_STORAGE_EVENT, onLocalUpdate);

  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(LANGUAGE_STORAGE_EVENT, onLocalUpdate);
  };
}

export function LanguageProvider({
  canUseEnglish,
  children,
}: {
  canUseEnglish: boolean;
  children: React.ReactNode;
}) {
  const storedLanguage = useSyncExternalStore<AppLanguage>(
    subscribeToLanguageChanges,
    readStoredLanguage,
    () => "es",
  );

  const language: AppLanguage = canUseEnglish ? storedLanguage : "es";

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const value = useMemo<LanguageContextValue>(() => {
    const setLanguage = (nextLanguage: AppLanguage) => {
      if (!canUseEnglish) {
        return;
      }

      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguage);
      window.dispatchEvent(new Event(LANGUAGE_STORAGE_EVENT));
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
