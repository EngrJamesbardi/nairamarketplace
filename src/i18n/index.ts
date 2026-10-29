import { en, type MessageKey } from "./en";

const dictionaries: Record<string, Partial<Record<MessageKey, string>>> = { en };
export const SUPPORTED_LANGUAGES = Object.keys(dictionaries);

export function t(key: MessageKey, lang = "en"): string {
  return dictionaries[lang]?.[key] ?? en[key] ?? key;
}
