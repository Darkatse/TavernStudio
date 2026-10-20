import { clsx } from 'clsx';
import { Check, KeyRound, MessagesSquare } from 'lucide-react';
import type { ReactNode } from 'react';
import { useMessages } from '../i18n/messages';
import { exportsOf } from '../project/export';
import { projectMessages } from '../project/messages';
import { usePlacements } from '../project/mount-points';
import { startProject, useStartingProject } from '../project/start';
import { PROJECT_TEMPLATES } from '../project/templates';
import { Button } from '../ui/button';
import { EmptyState } from '../ui/empty-state';
import { agentMessages } from './messages';
import { connectText, useSetup } from './setup';

/** Lists what is left to set up, in either order; once nothing is, offers requests to start from. */
export function Welcome({
  onSuggest,
  onOpenModels,
}: {
  onSuggest: (request: string) => void;
  onOpenModels: () => void;
}) {
  const m = useMessages(agentMessages);
  const setup = useSetup();
  if (!setup) return <div className="flex-1" />;
  const { project, model } = setup;
  const left = Number(!project) + Number('problem' in model);

  return (
    <div className="flex min-h-0 flex-1 overflow-y-auto px-6">
      <div className="m-auto w-full py-8">
        <EmptyState
          icon={<MessagesSquare />}
          title={m.welcome}
          description={left > 0 ? m.setup.stepsLeft(left) : m.welcomeReady}
          action={
            left > 0 ? (
              <ol className="flex w-full max-w-80 flex-col gap-2 text-left transition-opacity motion-moderate starting:opacity-0">
                <Step title={m.setup.project} done={project?.record.name}>
                  <p className="text-caption text-pretty text-muted">{m.setup.projectHint}</p>
                  <TemplateCards />
                </Step>
                <Step
                  title={m.setup.model}
                  done={
                    'problem' in model
                      ? undefined
                      : `${model.endpoint.label} · ${model.endpoint.model}`
                  }
                >
                  <p className="text-caption text-pretty text-muted">{m.setup.modelHint}</p>
                  {'problem' in model && (
                    <Button className="self-start" onClick={onOpenModels}>
                      <KeyRound />
                      {connectText(model.problem, m)}
                    </Button>
                  )}
                </Step>
              </ol>
            ) : (
              <Suggestions onSuggest={onSuggest} />
            )
          }
        />
      </div>
    </div>
  );
}

/** A step not done shows how to do it; one done shows what it was done with. */
function Step({
  title,
  done,
  children,
}: {
  title: string;
  done: string | undefined;
  children: ReactNode;
}) {
  const m = useMessages(agentMessages);
  return (
    <li className="flex flex-col gap-2.5 rounded-xl bg-sunken p-3">
      <div className="flex min-w-0 items-center gap-2.5">
        {done === undefined ? (
          <span className="size-4 shrink-0 rounded-full shadow-[inset_0_0_0_1.5px_var(--color-line-strong)]" />
        ) : (
          <span className="grid size-4 shrink-0 place-items-center rounded-full bg-fg text-surface transition-[opacity,scale] motion-moderate starting:opacity-0 motion-safe:starting:scale-50">
            <Check className="size-2.5" strokeWidth={3} />
            <span className="sr-only">{m.setup.done}</span>
          </span>
        )}
        <span className={clsx('shrink-0 font-medium', done !== undefined && 'text-muted')}>
          {title}
        </span>
        {done !== undefined && (
          <span className="ml-auto min-w-0 truncate text-caption text-muted">{done}</span>
        )}
      </div>
      {done === undefined && children}
    </li>
  );
}

function TemplateCards() {
  const { templates } = useMessages(projectMessages);
  const starting = useStartingProject();
  return (
    <div className="grid grid-cols-2 gap-2">
      {PROJECT_TEMPLATES.map((template) => {
        const text = templates[template.folder];
        return (
          <button
            key={template.folder}
            type="button"
            disabled={starting !== undefined}
            aria-busy={starting === template.folder}
            onClick={() => void startProject(template)}
            className="flex cursor-pointer flex-col items-start gap-1 rounded-lg bg-raised p-3 text-left shadow-control transition-[background-color,opacity] motion-fast not-disabled:hover:bg-hover disabled:cursor-default not-aria-busy:disabled:opacity-45"
          >
            <span className="mb-1 grid size-(--size-icon) place-items-center text-muted">
              {starting === template.folder ? (
                <span className="size-3.5 animate-spin rounded-full border-[1.5px] border-line-strong border-t-fg" />
              ) : (
                <template.icon className="size-(--size-icon)" />
              )}
            </span>
            <span className="font-medium">{text.kind}</span>
            <span className="text-caption text-pretty text-muted">{text.description}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Requests suited to what the project places; one fills the composer rather than sending. */
function Suggestions({ onSuggest }: { onSuggest: (request: string) => void }) {
  const m = useMessages(agentMessages);
  const kinds = new Set(exportsOf(usePlacements()).map((item) => item.kind));
  if (kinds.size === 0) return null;
  return (
    <section className="flex w-full max-w-80 flex-col gap-1.5 text-left transition-opacity motion-moderate starting:opacity-0">
      <h3 className="px-1 text-caption text-muted">{m.suggestionsLabel}</h3>
      <ul className="flex flex-col gap-1.5">
        {[...kinds].flatMap((kind) =>
          m.suggestions[kind].map((request) => (
            <li key={request}>
              <button
                type="button"
                onClick={() => onSuggest(request)}
                className="w-full cursor-pointer rounded-lg bg-sunken px-3 py-2 text-left text-pretty transition-colors motion-fast hover:bg-hover"
              >
                {request}
              </button>
            </li>
          )),
        )}
      </ul>
    </section>
  );
}
