import { clsx } from 'clsx';
import { Marked } from 'marked';

/**
 * Model output is untrusted: raw HTML is shown as text, images are not
 * loaded, and only http(s) and mailto links stay links.
 */
const marked = new Marked({
  gfm: true,
  renderer: {
    html: ({ text }) => escapeHtml(text),
    image: ({ text }) => escapeHtml(text),
    link({ href, title, tokens }) {
      const text = this.parser.parseInline(tokens);
      if (!/^(?:https?:|mailto:)/i.test(href)) return text;
      const titled = title ? ` title="${escapeHtml(title)}"` : '';
      return `<a href="${escapeHtml(href)}"${titled} target="_blank" rel="noreferrer noopener">${text}</a>`;
    },
  },
});

/**
 * Streamed text is split into top-level blocks: a finished block renders the
 * same HTML every time, which React leaves untouched, so only the last block
 * changes and earlier lines never reflow.
 */
export function Markdown({ text, streaming = false }: { text: string; streaming?: boolean }) {
  const blocks = marked.lexer(text).map((block) => block.raw);
  return (
    <div className={clsx('markdown', streaming && 'markdown-streaming')}>
      {blocks.map((raw, index) => (
        // Blocks only ever grow at the end, so a block's place is its identity.
        // oxlint-disable-next-line react/no-array-index-key
        <Block key={index} raw={raw} />
      ))}
    </div>
  );
}

function Block({ raw }: { raw: string }) {
  return (
    <div
      className="contents"
      dangerouslySetInnerHTML={{ __html: marked.parse(raw, { async: false }) }}
    />
  );
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
