import { supportedEfforts, type Endpoint, type ModelThinkingLevel } from '@tavern-studio/agent';
import { Suspense, use } from 'react';
import { useMessages } from '../i18n/messages';
import { LoadingLine } from '../ui/loading';
import {
  Menu,
  MenuContent,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from '../ui/menu';
import { Tooltip } from '../ui/tooltip';
import { EffortButton } from './effort-button';
import { effortMessages } from './effort-messages';
import { chooseEffort, effortOf } from './settings';

/** Keyed by the model behind an endpoint, which alone decides what it offers. */
const offered = new Map<string, Promise<ModelThinkingLevel[]>>();

function effortsOf(endpoint: Endpoint): Promise<ModelThinkingLevel[]> {
  const key = `${endpoint.id}\n${endpoint.api}\n${endpoint.model}`;
  let efforts = offered.get(key);
  if (!efforts) {
    efforts = supportedEfforts(endpoint);
    offered.set(key, efforts);
  }
  return efforts;
}

/**
 * Off the first screen with its text: the button fades in once it loads, as
 * it does whenever the model becomes a reasoning one. The efforts come from
 * pi-ai's knowledge of the model, which loads with the provider's catalog,
 * so pointing at the button starts loading them.
 */
export function EffortMenu({ endpoint, running }: { endpoint: Endpoint; running: boolean }) {
  const m = useMessages(effortMessages);
  const prefetch = () => void effortsOf(endpoint);
  return (
    <Menu>
      <span className="flex shrink-0 transition-[opacity,scale] motion-moderate starting:opacity-0 motion-safe:starting:scale-90">
        <Tooltip content={running ? m.running : m.label} side="top">
          <MenuTrigger
            render={<EffortButton effort={effortOf(endpoint)} disabled={running} />}
            onPointerEnter={prefetch}
            onFocus={prefetch}
          />
        </Tooltip>
      </span>
      <MenuContent>
        <Suspense
          fallback={
            <div aria-busy="true" className="relative h-(--size-control)">
              <LoadingLine label={m.loading} />
            </div>
          }
        >
          <Efforts endpoint={endpoint} />
        </Suspense>
      </MenuContent>
    </Menu>
  );
}

/** From the most down; turning reasoning off stands apart below. */
function Efforts({ endpoint }: { endpoint: Endpoint }) {
  const m = useMessages(effortMessages);
  const efforts = use(effortsOf(endpoint));
  return (
    <MenuRadioGroup
      value={effortOf(endpoint)}
      onValueChange={(effort) => void chooseEffort(endpoint.id, effort)}
    >
      {efforts
        .filter((effort) => effort !== 'off')
        .toReversed()
        .map((effort) => (
          <MenuRadioItem key={effort} value={effort}>
            {m.levels[effort]}
          </MenuRadioItem>
        ))}
      {efforts.includes('off') && (
        <>
          <MenuSeparator />
          <MenuRadioItem value="off">{m.levels.off}</MenuRadioItem>
        </>
      )}
    </MenuRadioGroup>
  );
}
