import { DEFAULT_LOCALE, type AppLocale } from "@/types/i18n/locale.types";

type MessageTree = Record<string, unknown>;

const cache = new Map<AppLocale, MessageTree>();

export async function loadMessages(locale: AppLocale): Promise<MessageTree> {
  const hit = cache.get(locale);
  if (hit) return hit;
  const messages = (await import(`../../messages/${locale}.json`)).default as MessageTree;
  cache.set(locale, messages);
  return messages;
}

/** Resolve a dotted key in a message tree. Falls back to English, then the key. */
export function messageAt(
  messages: MessageTree,
  key: string,
  fallbackMessages?: MessageTree,
): string {
  const fromPrimary = dig(messages, key);
  if (fromPrimary !== null) return fromPrimary;
  if (fallbackMessages) {
    const fromFallback = dig(fallbackMessages, key);
    if (fromFallback !== null) return fromFallback;
  }
  return key;
}

function dig(tree: MessageTree, key: string): string | null {
  const parts = key.split(".");
  let node: unknown = tree;
  for (const part of parts) {
    if (node && typeof node === "object" && part in node) {
      node = (node as Record<string, unknown>)[part];
    } else {
      return null;
    }
  }
  return typeof node === "string" ? node : null;
}

export async function tStatic(
  locale: AppLocale,
  key: string,
  values?: Record<string, string | number>,
): Promise<string> {
  const messages = await loadMessages(locale);
  const fallback =
    locale === DEFAULT_LOCALE ? undefined : await loadMessages(DEFAULT_LOCALE);
  let text = messageAt(messages, key, fallback);
  if (values) {
    for (const [name, value] of Object.entries(values)) {
      text = text.replaceAll(`{${name}}`, String(value));
    }
  }
  return text;
}
