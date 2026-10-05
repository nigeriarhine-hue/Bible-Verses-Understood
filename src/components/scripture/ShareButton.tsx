import { useMemo, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { trackEvent } from '../../lib/analytics';
import type { Passage } from '../../lib/bible/types';
import { supabase } from '../../lib/supabase';
import { absoluteUrl } from '../../lib/urls';
import { referenceToPath } from '../../lib/bible/reference';
import { Icon } from '../ui/Icon';
import { Modal } from '../ui/Modal';

const BACKGROUNDS = [
  { id: 'sunrise', label: 'Sunrise', from: '#c9762e', via: '#edb06a', to: '#fff3e2' },
  { id: 'day', label: 'Daylight', from: '#e09a44', via: '#f2c47d', to: '#fff8ec' },
  { id: 'golden', label: 'Golden hour', from: '#b5641f', via: '#eaa65e', to: '#ffeccf' },
  { id: 'night', label: 'Dusk', from: '#8c5225', via: '#c08a4e', to: '#f3dcb8' },
] as const;

/**
 * The card's own colours.
 *
 * Shared by the preview in the modal and by the canvas that produces the image
 * people actually post, so the two cannot drift apart again.
 */
const CARD = {
  panel: 'rgba(252, 243, 226, 0.92)',
  ink: '#36220E',
  reference: '#84480A',
  wordmark: 'rgba(96, 70, 44, 0.85)',
  glow: '255, 226, 165',
} as const;

/**
 * Share a verse: copy the text, use the system share sheet, or download a
 * Scripture card image drawn on a canvas.
 */
export function ShareButton({ passage, tone = 'light' }: { passage: Passage; tone?: 'light' | 'dark' }) {
  const { notify } = useToast();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [background, setBackground] = useState<(typeof BACKGROUNDS)[number]['id']>('sunrise');
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const shareText = useMemo(
    () => `“${passage.text}”\n\n${passage.reference.reference} (${passage.translation})`,
    [passage],
  );

  // Always share the passage's public URL, even when the reader is on a preview
  // deployment or localhost.
  const shareUrl = useMemo(() => absoluteUrl(referenceToPath(passage.reference)), [passage]);

  const record = (method: string) => {
    trackEvent('verse_shared', {
      reference: passage.reference.reference,
      translation: passage.translation,
      method,
    });
    if (user && supabase) {
      supabase
        .from('share_cards')
        .insert({
          user_id: user.id,
          reference: passage.reference.reference,
          translation: passage.translation,
          background_style: background,
        })
        .then(undefined, () => undefined);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${shareText}\n\n${shareUrl}`);
      notify('Verse copied to your clipboard.', 'success');
      record('copy');
    } catch {
      notify('Your browser would not let us copy that.', 'error');
    }
  };

  const systemShare = async () => {
    if (!navigator.share) {
      void copy();
      return;
    }
    try {
      await navigator.share({
        title: `${passage.reference.reference} — Bible Verses Understood`,
        text: shareText,
        url: shareUrl,
      });
      record('system');
    } catch {
      /* the reader cancelled — nothing to report */
    }
  };

  const download = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawCard(canvas, passage, BACKGROUNDS.find((b) => b.id === background)!);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${passage.reference.reference.replace(/[\s:]+/g, '-').toLowerCase()}.png`;
      link.click();
      URL.revokeObjectURL(url);
      record('card');
      notify('Scripture card saved.', 'success');
    }, 'image/png');
  };

  const buttonClass = tone === 'light' ? 'btn btn-on-light min-h-0 px-3.5 py-2' : 'btn btn-secondary min-h-0 px-3.5 py-2';

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`${buttonClass} text-ui-xs`}>
        <Icon name="share" className="h-4 w-4" />
        Share
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Share this Scripture"
        description={`${passage.reference.reference} · ${passage.translationName}`}
      >
        <div
          className="overflow-hidden rounded-2xl p-6"
          style={{
            background: `linear-gradient(160deg, ${BACKGROUNDS.find((b) => b.id === background)!.from} 0%, ${
              BACKGROUNDS.find((b) => b.id === background)!.via
            } 55%, ${BACKGROUNDS.find((b) => b.id === background)!.to} 100%)`,
          }}
        >
          <div
            className="rounded-xl p-4 backdrop-blur-md"
            style={{ backgroundColor: CARD.panel }}
          >
            <p
              className="font-serif text-[1.0625rem] leading-[1.7rem]"
              style={{ color: CARD.ink }}
            >
              “{passage.text.length > 260 ? `${passage.text.slice(0, 258)}…` : passage.text}”
            </p>
            <p className="mt-3 text-ui-xs font-semibold" style={{ color: CARD.reference }}>
              {passage.reference.reference} · {passage.translation}
            </p>
          </div>
        </div>

        <fieldset className="mt-4">
          <legend className="text-ui-xs font-semibold uppercase tracking-wider muted">Background</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {BACKGROUNDS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setBackground(option.id)}
                aria-pressed={background === option.id}
                className={`btn min-h-0 px-3.5 py-2 text-ui-xs ${
                  background === option.id ? 'btn-primary' : 'btn-secondary'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="mt-5 grid gap-2 sm:grid-cols-3">
          <button type="button" onClick={() => void copy()} className="btn btn-secondary">
            <Icon name="layers" className="h-4 w-4" />
            Copy text
          </button>
          <button type="button" onClick={() => void systemShare()} className="btn btn-secondary">
            <Icon name="share" className="h-4 w-4" />
            Share
          </button>
          <button type="button" onClick={download} className="btn btn-primary">
            <Icon name="sparkle" className="h-4 w-4" />
            Save card
          </button>
        </div>

        <canvas ref={canvasRef} width={1080} height={1080} className="hidden" />
      </Modal>
    </>
  );
}

/** Draws the shareable Scripture card at 1080×1080. */
function drawCard(
  canvas: HTMLCanvasElement,
  passage: Passage,
  background: (typeof BACKGROUNDS)[number],
): void {
  const context = canvas.getContext('2d');
  if (!context) return;
  const size = canvas.width;

  const gradient = context.createLinearGradient(0, 0, size * 0.4, size);
  gradient.addColorStop(0, background.from);
  gradient.addColorStop(0.55, background.via);
  gradient.addColorStop(1, background.to);
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);

  // Soft light from one corner, matching the app's sky.
  const glow = context.createRadialGradient(size * 0.78, size * 0.82, 0, size * 0.78, size * 0.82, size * 0.7);
  glow.addColorStop(0, `rgba(${CARD.glow}, 0.4)`);
  glow.addColorStop(1, `rgba(${CARD.glow}, 0)`);
  context.fillStyle = glow;
  context.fillRect(0, 0, size, size);

  // The panel the words sit on, so they are always readable.
  const margin = 88;
  const panelWidth = size - margin * 2;
  context.fillStyle = CARD.panel;
  roundedRect(context, margin, margin, panelWidth, size - margin * 2, 44);
  context.fill();

  const text = passage.text.length > 420 ? `${passage.text.slice(0, 418)}…` : passage.text;
  context.fillStyle = CARD.ink;
  context.textBaseline = 'top';
  const fontSize = text.length > 260 ? 40 : text.length > 150 ? 46 : 54;
  context.font = `500 ${fontSize}px Lora, Georgia, serif`;

  const lines = wrapText(context, `“${text}”`, panelWidth - 112);
  const lineHeight = fontSize * 1.5;
  const blockHeight = lines.length * lineHeight;
  let y = Math.max(margin + 90, (size - blockHeight) / 2 - 40);
  for (const line of lines) {
    context.fillText(line, margin + 56, y);
    y += lineHeight;
  }

  context.font = '600 34px Inter, system-ui, sans-serif';
  context.fillStyle = CARD.reference;
  context.fillText(`${passage.reference.reference} · ${passage.translation}`, margin + 56, y + 34);

  context.font = '500 26px Inter, system-ui, sans-serif';
  context.fillStyle = CARD.wordmark;
  context.fillText('Bible Verses Understood', margin + 56, size - margin - 58);
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

function wrapText(context: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (context.measureText(candidate).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}
