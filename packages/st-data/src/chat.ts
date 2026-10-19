/**
 * A chat file is JSONL: the header with `chat_metadata` first, then one
 * message per line. Unparseable lines are dropped, as SillyTavern does.
 */
export function parseChat(text: string): unknown[] {
  if (text.length === 0) return [];
  return text.split('\n').flatMap((line) => {
    try {
      return [JSON.parse(line) as unknown];
    } catch {
      return [];
    }
  });
}

export function serializeChat(items: readonly unknown[]): string {
  return items.map((item) => JSON.stringify(item)).join('\n');
}
