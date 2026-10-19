import { FileCode2, Plus } from 'lucide-react';
import { useState } from 'react';
import { createProject, openProject } from '../project/projects';
import { useCurrentProject } from '../project/use-project';
import { Button } from '../ui/button';
import { EmptyState } from '../ui/empty-state';

export function CodeView() {
  const project = useCurrentProject();
  const [creating, setCreating] = useState(false);

  if (!project) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-8">
        <EmptyState
          icon={<FileCode2 />}
          title="尚未打开项目"
          description="从模板新建一个项目，文件会显示在这里，改动即时出现在预览中。"
          action={
            <Button
              disabled={creating}
              onClick={() => {
                setCreating(true);
                void createProject('theme', '我的主题')
                  .then(openProject)
                  .finally(() => setCreating(false));
              }}
            >
              <Plus />
              新建主题项目
            </Button>
          }
        />
      </div>
    );
  }
  return <div className="flex min-h-0 flex-1" />;
}
