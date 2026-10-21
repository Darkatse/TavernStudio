import { undoneOperations } from '@tavern-studio/agent';
import { FoldVertical, Settings2 } from 'lucide-react';
import { formatNumber } from '../i18n/common';
import { useMessages } from '../i18n/messages';
import { Button } from '../ui/button';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '../ui/menu';
import { Tooltip } from '../ui/tooltip';
import { contextMeterMessages } from './context-meter-messages';
import type { Conversation, ConversationState } from './conversation';
import { selectedEndpoint, useAgentSettings } from './settings';
import { useConversationState } from './use-conversation';

const COMPACT: Intl.NumberFormatOptions = { notation: 'compact', maximumFractionDigits: 1 };
const RING = 2 * Math.PI * 5.5;

/**
 * How full the conversation's context is, by the provider's count of the
 * last request or a compaction's estimate. Off the first screen with its
 * text; it fades in once a conversation has a count.
 */
export function ContextMeter({
  conversation,
  onOpenModels,
}: {
  conversation: Conversation;
  onOpenModels: () => void;
}) {
  const m = useMessages(contextMeterMessages);
  const state = useConversationState(conversation);
  const settings = useAgentSettings();
  const window = selectedEndpoint(settings).endpoint?.contextWindow;
  const tokens = contextTokens(state);
  if (tokens === undefined || !window) return null;
  const share = Math.min(tokens / window, 1);
  const percent = formatNumber(share, { style: 'percent', maximumFractionDigits: 0 });
  const used = formatNumber(tokens, COMPACT);
  const of = formatNumber(window, COMPACT);
  const busy = state.active !== undefined || state.elsewhere || state.rollingBack;

  return (
    <Menu>
      <span className="flex shrink-0 transition-[opacity,scale] motion-moderate starting:opacity-0 motion-safe:starting:scale-90">
        <Tooltip content={m.used(used, of)} side="top">
          <MenuTrigger
            render={
              <Button
                variant="ghost"
                aria-label={m.label(percent)}
                className="gap-1 px-1.5 text-caption text-muted tabular-nums"
              />
            }
          >
            <svg viewBox="0 0 14 14" aria-hidden="true" className="-rotate-90">
              <circle cx="7" cy="7" r="5.5" fill="none" strokeWidth="2" className="stroke-line" />
              <circle
                cx="7"
                cy="7"
                r="5.5"
                fill="none"
                strokeWidth="2"
                stroke="currentColor"
                strokeDasharray={`${share * RING} ${RING}`}
              />
            </svg>
            {percent}
          </MenuTrigger>
        </Tooltip>
      </span>
      <MenuContent>
        <p className="max-w-64 px-2 py-1.5 text-caption text-pretty text-muted">
          {m.detail(used, of, settings.compactAt)}
        </p>
        <MenuSeparator />
        <MenuItem
          icon={<FoldVertical />}
          disabled={busy}
          onClick={() => void conversation.compact()}
        >
          {m.compactNow}
        </MenuItem>
        <MenuItem icon={<Settings2 />} onClick={onOpenModels}>
          {m.settings}
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

/** The latest count in the conversation's own operations that are in effect. */
function contextTokens({ entries, events }: ConversationState): number | undefined {
  const own = new Set(entries.map((entry) => entry.run));
  const undone = undoneOperations(events);
  let tokens: number | undefined;
  for (const event of events) {
    if (!own.has(event.run) || undone.has(event.run)) continue;
    if (event.type === 'context_compacted') tokens = event.after;
    if (event.type !== 'model_completed') continue;
    const { input, cacheRead, cacheWrite, output } = event.usage;
    // A failed request has no count.
    if (input + cacheRead + cacheWrite > 0) tokens = input + cacheRead + cacheWrite + output;
  }
  return tokens;
}
