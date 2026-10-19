import type { ItemInstance } from '@headless-tree/core';
import { clsx } from 'clsx';
import {
  Braces,
  ChevronRight,
  Ellipsis,
  File,
  FileCode,
  FileImage,
  FileText,
  Folder,
  FolderOpen,
  Link2,
  TriangleAlert,
} from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { useMessages } from '../i18n/messages';
import { MenuTrigger, type MenuHandle } from '../ui/menu';
import { PathText } from '../ui/path-text';
import { Tooltip } from '../ui/tooltip';
import { codeMessages } from './messages';
import type { TreeNode } from './tree-model';

export interface Naming {
  value: string;
  problem: string | undefined;
  onChange: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}

export interface FileRowProps {
  item: ItemInstance<TreeNode>;
  active: boolean;
  mountPoints: readonly string[] | undefined;
  naming: Naming | undefined;
  menu: MenuHandle<TreeNode>;
}

export function FileRow({ item, active, mountPoints, naming, menu }: FileRowProps) {
  const m = useMessages(codeMessages);
  const node = item.getItemData();
  const level = item.getItemMeta().level;
  const expanded = item.isExpanded();

  return (
    <div
      {...item.getProps()}
      aria-selected={active}
      aria-description={mountPoints && m.mountedAtPoints(mountPoints)}
      data-path={node.path}
      className="group/row relative flex h-(--size-control) cursor-default items-center gap-1.5 rounded-md pr-1 transition-opacity motion-fast outline-none select-none aria-selected:bg-selected starting:opacity-0"
      style={{ paddingInlineStart: `calc(var(--spacing) * ${1 + level * 3})` }}
    >
      <span className="grid size-4 shrink-0 place-items-center text-muted">
        {node.folder && (
          <ChevronRight
            aria-hidden="true"
            className={clsx(
              'size-3.5 transition-[rotate] motion-moderate motion-reduce:transition-none',
              expanded && 'rotate-90',
            )}
          />
        )}
      </span>
      <FileIcon node={node} expanded={expanded} />
      {naming ? (
        <NameField naming={naming} label={node.draft ? m.newName : m.newNameFor(node.name)} />
      ) : (
        <span className="min-w-0 flex-1 truncate">{node.name}</span>
      )}
      {mountPoints && !naming && (
        <Tooltip content={<MountPointList points={mountPoints} />}>
          <span className="grid size-5 shrink-0 place-items-center text-muted">
            <Link2 aria-hidden="true" className="size-3.5" />
          </span>
        </Tooltip>
      )}
      {!naming && (
        <MenuTrigger
          handle={menu}
          payload={node}
          render={
            <button
              type="button"
              tabIndex={-1}
              aria-label={m.actionsFor(node.name)}
              className="grid size-6 shrink-0 cursor-pointer place-items-center rounded-sm text-muted opacity-0 transition-[opacity,background-color,color] motion-fast group-hover/row:opacity-100 group-focus-visible/row:opacity-100 hover:bg-hover hover:text-fg data-popup-open:opacity-100 pointer-coarse:opacity-100"
              onClick={(event) => event.stopPropagation()}
            />
          }
        >
          <Ellipsis className="size-3.5" />
        </MenuTrigger>
      )}
    </div>
  );
}

function FileIcon({ node, expanded }: { node: TreeNode; expanded: boolean }) {
  const Icon = node.folder
    ? expanded
      ? FolderOpen
      : Folder
    : (iconsByExtension[/\.([^./]+)$/.exec(node.name)?.[1]?.toLowerCase() ?? ''] ?? File);
  return <Icon aria-hidden="true" className="size-(--size-icon) shrink-0 text-muted" />;
}

const iconsByExtension: Record<string, typeof File> = {
  css: FileCode,
  js: FileCode,
  mjs: FileCode,
  html: FileCode,
  json: Braces,
  md: FileText,
  txt: FileText,
  png: FileImage,
  jpg: FileImage,
  jpeg: FileImage,
  webp: FileImage,
  gif: FileImage,
  svg: FileImage,
};

export function MountPointList({ points }: { points: readonly string[] }) {
  const m = useMessages(codeMessages);
  return (
    <span className="flex flex-col gap-0.5">
      <span>{m.mountedAt}</span>
      {points.map((point) => (
        <span key={point} className="font-mono break-words">
          <PathText path={point} />
        </span>
      ))}
    </span>
  );
}

function NameField({ naming, label }: { naming: Naming; label: string }) {
  const input = useRef<HTMLInputElement>(null);
  const problemId = useId();
  useEffect(() => {
    const field = input.current;
    if (!field) return;
    field.focus();
    const dot = field.value.lastIndexOf('.');
    field.setSelectionRange(0, dot > 0 ? dot : field.value.length);
  }, []);

  return (
    <span className="relative flex min-w-0 flex-1">
      <input
        ref={input}
        value={naming.value}
        aria-label={label}
        aria-invalid={naming.problem !== undefined}
        aria-describedby={naming.problem ? problemId : undefined}
        spellCheck={false}
        autoComplete="off"
        className="h-[calc(var(--size-control)-6px)] min-w-0 flex-1 rounded-sm bg-surface px-1.5 shadow-control outline-none focus-visible:outline-none aria-invalid:shadow-[0_0_0_1px_var(--color-danger)]"
        onChange={(event) => naming.onChange(event.target.value)}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === 'Enter') {
            event.preventDefault();
            naming.onCommit();
          } else if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            naming.onCancel();
          }
        }}
        onBlur={() =>
          naming.problem || naming.value.trim() === '' ? naming.onCancel() : naming.onCommit()
        }
      />
      {naming.problem && (
        <Problem id={problemId}>
          <TriangleAlert aria-hidden="true" className="mt-px size-3.5 shrink-0 text-danger" />
          {naming.problem}
        </Problem>
      )}
    </span>
  );
}

function Problem({ id, children }: { id: string; children: ReactNode }) {
  return (
    <span
      id={id}
      role="alert"
      // The tree's panel clips anything wider than the field.
      className="absolute top-full left-0 z-20 mt-1 flex w-max max-w-full items-start gap-1.5 rounded-md bg-raised px-2 py-1.5 text-caption shadow-popover"
    >
      {children}
    </span>
  );
}
