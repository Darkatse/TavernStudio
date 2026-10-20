import { FileCode2 } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import { useMessages } from '../i18n/messages';
import { projectMessages } from '../project/messages';
import { startProject, useStartingProject } from '../project/start';
import { PROJECT_TEMPLATES } from '../project/templates';
import { useCurrentProject } from '../project/use-project';
import { Button } from '../ui/button';
import { EmptyState } from '../ui/empty-state';
import { LoadingLine } from '../ui/loading';
import { workbenchMessages } from './messages';

const ProjectCode = lazy(() =>
  import('../code/project-code').then((module) => ({ default: module.ProjectCode })),
);

export function CodeView({ shown }: { shown: boolean }) {
  const m = useMessages(workbenchMessages).codeView;
  const { templates } = useMessages(projectMessages);
  const project = useCurrentProject();
  const starting = useStartingProject();
  const [wanted, setWanted] = useState(shown);
  if (shown && !wanted) setWanted(true);

  if (!project) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-8">
        <EmptyState
          icon={<FileCode2 />}
          title={m.empty}
          description={m.emptyDetail}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {PROJECT_TEMPLATES.map((template) => (
                <Button
                  key={template.folder}
                  disabled={starting !== undefined}
                  onClick={() => void startProject(template)}
                >
                  <template.icon />
                  {templates[template.folder].action}
                </Button>
              ))}
            </div>
          }
        />
      </div>
    );
  }
  if (!wanted) return null;
  return (
    <Suspense
      fallback={
        <div aria-busy="true" className="relative flex-1">
          <LoadingLine label={m.loading} />
        </div>
      }
    >
      <ProjectCode key={project.record.id} project={project} />
    </Suspense>
  );
}
