import { ArrowUp } from 'lucide-react';
import type { FormEvent } from 'react';
import { Button } from '../ui/button';
import { Tooltip } from '../ui/tooltip';

function fitToContent(event: FormEvent<HTMLTextAreaElement>) {
  const field = event.currentTarget;
  field.style.height = 'auto';
  field.style.height = `${field.scrollHeight}px`;
}

/** Sending needs a configured model; until then the send button says so. */
export function Composer() {
  return (
    <form className="shrink-0 px-3 pb-3" onSubmit={(event) => event.preventDefault()}>
      <div className="rounded-xl bg-surface shadow-control transition-shadow motion-fast focus-within:shadow-focus">
        <label htmlFor="composer-message" className="sr-only">
          给 Agent 的消息
        </label>
        <textarea
          id="composer-message"
          rows={2}
          placeholder="描述你想要的效果…"
          onInput={fitToContent}
          className="block max-h-48 w-full resize-none bg-transparent px-3.5 pt-3 outline-none placeholder:text-muted"
        />
        <div data-density="compact" className="flex items-center justify-between gap-2 p-2 pl-3.5">
          <span className="text-caption text-muted">未配置模型</span>
          <Tooltip content="配置模型后即可发送" side="top">
            <Button type="submit" variant="primary" icon disabled aria-label="发送">
              <ArrowUp />
            </Button>
          </Tooltip>
        </div>
      </div>
    </form>
  );
}
