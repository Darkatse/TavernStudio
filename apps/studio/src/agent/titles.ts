/** As TauriTavern names an untitled Session. */
const TITLE_CHARS = 80;

/**
 * The name a conversation has from its first message on, until the model
 * names it: the message's first line, its whitespace collapsed.
 */
export function firstLine(content: string | readonly { type: string; text?: string }[]): string {
  const text =
    typeof content === 'string'
      ? content
      : content
          .flatMap((part) => (part.type === 'text' && part.text ? [part.text] : []))
          .join('\n');
  const line = text.split('\n').find((each) => each.trim() !== '') ?? '';
  return Array.from(line.replaceAll(/\s+/g, ' ').trim()).slice(0, TITLE_CHARS).join('');
}

/** A conversation's name, as the author gives it. */
export function titleProblem(title: string): 'empty' | undefined {
  return title.trim() === '' ? 'empty' : undefined;
}
