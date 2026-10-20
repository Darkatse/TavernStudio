import { Dialog as BaseDialog } from '@base-ui/react/dialog';
import { useRef, useState, type ReactElement } from 'react';
import { common } from '../i18n/common';
import { useMessages } from '../i18n/messages';

export interface LightboxProps {
  src: string;
  alt: string;
  /** The thumbnail that opens it, which receives the trigger's props and ref. */
  children: ReactElement;
}

/**
 * An image shown whole over the page. It grows out of the thumbnail that
 * opened it and shrinks back into it; Esc or a click anywhere closes it.
 */
export function Lightbox({ src, alt, children }: LightboxProps) {
  const { close } = useMessages(common);
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);

  return (
    <BaseDialog.Root
      open={open}
      onOpenChange={(next) => {
        // Aimed again on the way out, at wherever the thumbnail is now.
        if (!next && popup.current && opener.current) aim(popup.current, opener.current);
        setOpen(next);
      }}
    >
      <BaseDialog.Trigger ref={opener} render={children} />
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className="fixed inset-0 min-h-dvh bg-scrim transition-opacity motion-slow data-ending-style:opacity-0 data-starting-style:opacity-0 supports-[-webkit-touch-callout:none]:absolute" />
        <BaseDialog.Viewport className="fixed inset-0 grid cursor-zoom-out place-items-center p-4 data-ending-style:pointer-events-none md:p-8">
          <BaseDialog.Popup
            ref={(node) => {
              popup.current = node;
              if (!node || !opener.current) return;
              // Measuring settles its style, so it moves over the thumbnail
              // with transitions off; only the way back to rest animates.
              node.style.transition = 'none';
              aim(node, opener.current);
              void node.offsetWidth;
              node.style.transition = '';
            }}
            aria-label={alt}
            className="motion-zoom motion-slow outline-none"
          >
            <BaseDialog.Close aria-label={close} className="block cursor-zoom-out rounded-lg">
              <img
                src={src}
                alt={alt}
                className="block max-h-[calc(100dvh-2rem)] max-w-[calc(100vw-2rem)] rounded-lg shadow-frame md:max-h-[calc(100dvh-4rem)] md:max-w-[calc(100vw-4rem)]"
              />
            </BaseDialog.Close>
          </BaseDialog.Popup>
        </BaseDialog.Viewport>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}

/**
 * Sets the transform that lays the popup over the opener. Offsets ignore
 * transforms, so this holds even mid-animation. An image without its size yet
 * is left unaimed and appears where it rests.
 */
function aim(popup: HTMLElement, opener: HTMLElement): void {
  if (popup.offsetWidth === 0) return;
  const from = opener.getBoundingClientRect();
  const x = popup.offsetLeft + popup.offsetWidth / 2;
  const y = popup.offsetTop + popup.offsetHeight / 2;
  popup.style.setProperty('--zoom-x', `${from.left + from.width / 2 - x}px`);
  popup.style.setProperty('--zoom-y', `${from.top + from.height / 2 - y}px`);
  popup.style.setProperty('--zoom-scale', String(from.width / popup.offsetWidth));
}
