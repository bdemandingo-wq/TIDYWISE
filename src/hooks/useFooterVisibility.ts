import { useEffect, useState } from "react";

const FOOTER_HIDDEN_STORAGE_KEY = "tidywise_footer_hidden";
const FOOTER_HIDDEN_EVENT = "footerHiddenChanged";

function safeParseArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

export function useFooterHiddenItems(): string[] {
  const [hidden, setHidden] = useState<string[]>(() =>
    safeParseArray(localStorage.getItem(FOOTER_HIDDEN_STORAGE_KEY))
  );

  useEffect(() => {
    const handleChange = () => {
      setHidden(safeParseArray(localStorage.getItem(FOOTER_HIDDEN_STORAGE_KEY)));
    };

    window.addEventListener("storage", handleChange);
    window.addEventListener(FOOTER_HIDDEN_EVENT, handleChange as EventListener);
    return () => {
      window.removeEventListener("storage", handleChange);
      window.removeEventListener(FOOTER_HIDDEN_EVENT, handleChange as EventListener);
    };
  }, []);

  return hidden;
}

export function setFooterHiddenItems(hidden: string[]) {
  localStorage.setItem(FOOTER_HIDDEN_STORAGE_KEY, JSON.stringify(hidden));
  window.dispatchEvent(new Event(FOOTER_HIDDEN_EVENT));
}

export function resetFooterHiddenItems() {
  localStorage.removeItem(FOOTER_HIDDEN_STORAGE_KEY);
  window.dispatchEvent(new Event(FOOTER_HIDDEN_EVENT));
}
