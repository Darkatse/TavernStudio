import { FileCode2 } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import { createFromTemplate, openProject } from '../project/projects';
import { PROJECT_TEMPLATES } from '../project/templates';
import { useCurrentProject } from '../project/use-project';
import { Button } from '../ui/button';
import { EmptyState } from '../ui/empty-state';
import { LoadingLine } from '../ui/loading';
import { showToast } from '../ui/toast';

// The file tree and the editor stay out of the first screen (docs/plan/P1.md, 性能).
const ProjectCode = lazy(() =>
  import('../code/project-code').then((module) => ({ default: module.ProjectCode })),
);

/**
 * The code view. Its editor loads the first time the view is shown and then
 * stays, like the preview, while the view is hidden.
 */
export function CodeView({ shown }: { shown: boolean }) {
  const project = useCurrentProject();
  const [creating, setCreating] = useState(false);
  const [wanted, setWanted] = useState(shown);
  if (shown && !wanted) setWanted(true);

  if (!project) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-8">
        <EmptyState
          icon={<FileCode2 />}
          title="尚未打开项目"
          description="从模板新建一个项目，文件会显示在这里，改动即时出现在预览中。"
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {PROJECT_TEMPLATES.map((template) => (
                <Button
                  key={template.folder}
                  disabled={creating}
                  onClick={() => {
                    setCreating(true);
                    void createFromTemplate(template)
                      .then(openProject)
                      .catch((error: unknown) =>
                        showToast({
                          kind: 'error',
                          title: '项目没能新建',
                          description: error instanceof Error ? error.message : String(error),
                        }),
                      )
                      .finally(() => setCreating(false));
                  }}
                >
                  <template.icon />
                  {template.action}
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
          <LoadingLine label="正在载入编辑器" />
        </div>
      }
    >
      <ProjectCode key={project.record.id} project={project} />
    </Suspense>
  );
}
