import { clsx } from 'clsx';
import { Check, ChevronRight, MessagesSquare } from 'lucide-react';
import type { ReactNode } from 'react';
import { useMessages } from '../i18n/messages';
import { exportsOf } from '../project/export';
import { projectMessages } from '../project/messages';
import { usePlacements } from '../project/mount-points';
import { startProject, useStartingProject } from '../project/start';
import { PROJECT_TEMPLATES } from '../project/templates';
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
  const ready = project && !('problem' in model);

  return (
    <div className="flex min-h-0 flex-1 overflow-y-auto px-6">
      <div className="m-auto w-full py-8">
        <EmptyState
          icon={<MessagesSquare />}
          title={m.welcome}
          action={
            ready ? (
              <Suggestions onSuggest={onSuggest} />
            ) : (
              <ol className="flex w-full max-w-80 flex-col gap-2 text-left transition-opacity motion-moderate starting:opacity-0">
                <Step title={m.setup.project} done={project?.name}>
                  <TemplateCards />
                </Step>
                {'problem' in model ? (
                  <Step title={connectText(model.problem, m)} onClick={onOpenModels} />
                ) : (
                  <Step
                    title={m.setup.model}
                    done={`${model.endpoint.label} · ${model.endpoint.model}`}
                  />
                )}
              </ol>
            )
          }
        />
      </div>
    </div>
  );
}

/** A step done shows what it was done with; one to do shows how, or is itself the way. */
function Step({
  title,
  done,
  onClick,
  children,
}: {
  title: string;
  done?: string | undefined;
  onClick?: () => void;
  children?: ReactNode;
}) {
  const m = useMessages(agentMessages);
  const row = (
    <>
      {done === undefined ? (
        <span className="size-4 shrink-0 rounded-full shadow-[inset_0_0_0_1.5px_var(--color-line-strong)]" />
      ) : (
        <span className="grid size-4 shrink-0 place-items-center rounded-full bg-fg text-surface transition-[opacity,scale] motion-moderate starting:opacity-0 motion-safe:starting:scale-50">
          <Check className="size-2.5" strokeWidth={3} />
          <span className="sr-only">{m.setup.done}</span>
        </span>
      )}
      <span className={clsx('min-w-0 truncate font-medium', done !== undefined && 'text-muted')}>
        {title}
      </span>
      {done !== undefined && (
        <span className="ml-auto min-w-0 truncate text-caption text-muted">{done}</span>
      )}
      {onClick && <ChevronRight className="ml-auto size-(--size-icon) shrink-0 text-muted" />}
    </>
  );
  return (
    <li className="flex flex-col rounded-xl bg-sunken">
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          className="flex cursor-pointer items-center gap-2.5 rounded-xl p-3 text-left transition-colors motion-fast hover:bg-hover"
        >
          {row}
        </button>
      ) : (
        <div className="flex items-center gap-2.5 p-3">{row}</div>
      )}
      {done === undefined && children && <div className="px-3 pb-3">{children}</div>}
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
