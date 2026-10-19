import { MessagesSquare } from 'lucide-react';
import { BrandMark } from '../brand/brand-mark';
import { EmptyState } from '../ui/empty-state';
import { Composer } from './composer';

export function AgentPanel() {
  return (
    <aside
      aria-label="Agent"
      className="flex h-full min-w-0 flex-col overflow-hidden rounded-xl bg-surface shadow-panel"
    >
      <header data-density="compact" className="flex h-12 shrink-0 items-center gap-2.5 px-4">
        <BrandMark className="size-5" />
        <span className="text-subtitle">Tavern Studio</span>
      </header>
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-8">
        <EmptyState
          icon={<MessagesSquare />}
          title="想做点什么？"
          description="描述你想要的主题、前端卡或脚本。Agent 会修改文件、查看预览，反复调整到满意为止。"
        />
      </div>
      <Composer />
    </aside>
  );
}
