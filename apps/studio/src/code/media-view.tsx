import type { ProjectStore } from '@tavern-studio/workspace';
import { clsx } from 'clsx';
import { Check, Copy, FileX2 } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useMessages } from '../i18n/messages';
import {
  BLANK_FAMILY,
  coverage,
  lendFont,
  specimenLines,
  type Coverage,
  type SpecimenLine,
} from '../media/font';
import { byteSize, mediaKind, type MediaKind } from '../media/kinds';
import { previewUrlOf, usePlacements } from '../project/mount-points';
import { Button } from '../ui/button';
import { EmptyState } from '../ui/empty-state';
import { Tooltip } from '../ui/tooltip';
import { codeMessages } from './messages';

const COPIED_MS = 1500;

/** An image or a font in the project, as the preview would show it, with the URL it has there. */
export function MediaView({ store, path }: { store: ProjectStore; path: string }) {
  const m = useMessages(codeMessages);
  const url = previewUrlOf(usePlacements(), path);
  const [file, setFile] = useState<{ bytes: Uint8Array; kind: MediaKind | undefined }>();

  useEffect(() => {
    let current = true;
    const read = () =>
      store.read(path).then(
        (bytes) => current && setFile({ bytes, kind: mediaKind(bytes) }),
        () => current && setFile(undefined),
      );
    void read();
    const stop = store.subscribe((paths) => {
      if (paths.includes(path)) void read();
    });
    return () => {
      current = false;
      stop();
    };
  }, [store, path]);

  if (!file) return null;
  if (!file.kind) {
    return <EmptyState icon={<FileX2 />} title={m.notText} description={m.notTextHint} />;
  }
  return file.kind.kind === 'image' ? (
    <ImageView bytes={file.bytes} kind={file.kind} url={url} />
  ) : (
    <FontView bytes={file.bytes} kind={file.kind} url={url} />
  );
}

function ImageView({
  bytes,
  kind,
  url,
}: {
  bytes: Uint8Array;
  kind: MediaKind;
  url: string | undefined;
}) {
  const image = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const object = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: kind.mimeType }));
    image.current!.src = object;
    return () => URL.revokeObjectURL(object);
  }, [bytes, kind]);
  const [size, setSize] = useState<{ width: number; height: number }>();

  return (
    <figure className="m-0 flex size-full min-h-0 flex-col items-center justify-center gap-4 p-6">
      <div className="flex min-h-0 w-full flex-1 items-center justify-center">
        <img
          ref={image}
          alt=""
          onLoad={(event) =>
            setSize({
              width: event.currentTarget.naturalWidth,
              height: event.currentTarget.naturalHeight,
            })
          }
          className="max-h-full max-w-full rounded-sm object-contain shadow-[0_0_0_1px_var(--color-line)] checkerboard"
        />
      </div>
      <Caption
        facts={[kind.format, size && `${size.width} × ${size.height}`, byteSize(bytes.length)]}
        url={url}
      />
    </figure>
  );
}

function FontView({
  bytes,
  kind,
  url,
}: {
  bytes: Uint8Array;
  kind: MediaKind;
  url: string | undefined;
}) {
  const m = useMessages(codeMessages);
  const [font, setFont] = useState<
    { family: string; lines: readonly SpecimenLine[]; coverage: Coverage[] } | 'failed'
  >();
  useEffect(() => {
    let release: (() => void) | undefined;
    let current = true;
    lendFont(bytes).then(
      (lent) => {
        if (!current) return lent.release();
        release = lent.release;
        setFont({
          family: lent.family,
          lines: specimenLines(lent.family),
          coverage: coverage(lent.family),
        });
      },
      () => current && setFont('failed'),
    );
    return () => {
      current = false;
      release?.();
    };
  }, [bytes]);

  if (font === 'failed') return <EmptyState icon={<FileX2 />} title={m.notFont} />;
  return (
    <figure className="m-0 flex size-full min-h-0 flex-col gap-4 p-6">
      <div className="flex min-h-0 w-full flex-1 overflow-auto">
        {font && (
          <div
            className="m-auto flex w-full max-w-200 flex-col gap-3 [overflow-wrap:anywhere] text-fg"
            style={{ fontFamily: `"${font.family}", "${BLANK_FAMILY}"` }}
          >
            {font.lines.map((line) => (
              <p key={line.text} className="m-0 leading-tight" style={{ fontSize: line.size }}>
                {line.text}
              </p>
            ))}
          </div>
        )}
      </div>
      <Caption facts={[kind.format, byteSize(bytes.length)]} url={url}>
        {font && (
          <span className="flex flex-wrap justify-center gap-x-3 gap-y-1 tabular-nums">
            {font.coverage.map((script) => (
              <span
                key={script.id}
                className={clsx(script.covered === 0 && 'text-muted')}
              >{`${m.scripts[script.id]} ${script.covered}/${script.total}`}</span>
            ))}
          </span>
        )}
      </Caption>
    </figure>
  );
}

function Caption({
  facts,
  url,
  children,
}: {
  facts: readonly (string | undefined)[];
  url: string | undefined;
  children?: ReactNode;
}) {
  const m = useMessages(codeMessages);
  return (
    <figcaption className="flex min-w-0 flex-col items-center gap-1 text-caption">
      {children}
      <span className="text-muted tabular-nums">{facts.filter(Boolean).join(' · ')}</span>
      {url ? (
        <span className="flex max-w-full min-w-0 items-center gap-1">
          <span className="truncate font-mono">{url}</span>
          <CopyButton text={url} label={m.copyUrl} done={m.copied} />
        </span>
      ) : (
        <span className="text-muted">{m.notPlaced}</span>
      )}
    </figcaption>
  );
}

/** The two icons share a cell: the one shown fades in, the other out. */
function CopyButton({ text, label, done }: { text: string; label: string; done: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <Tooltip content={copied ? done : label}>
      <Button
        variant="ghost"
        icon
        aria-label={label}
        className="size-6"
        onClick={() => void navigator.clipboard.writeText(text).then(() => setCopied(true))}
      >
        <span className="grid *:col-start-1 *:row-start-1">
          <Copy
            className={clsx(
              'transition-opacity',
              copied ? 'opacity-0 motion-fast-exit' : 'motion-fast',
            )}
          />
          <Check
            className={clsx(
              'transition-opacity',
              copied ? 'motion-fast' : 'opacity-0 motion-fast-exit',
            )}
          />
        </span>
      </Button>
    </Tooltip>
  );
}
