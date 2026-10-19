import { FileCode2 } from 'lucide-react';
import { EmptyState } from '../ui/empty-state';

export function CodeView() {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-8">
      <EmptyState
        icon={<FileCode2 />}
        title="尚未打开项目"
        description="新建项目或打开本地文件夹后，文件会显示在这里。"
      />
    </div>
  );
}
