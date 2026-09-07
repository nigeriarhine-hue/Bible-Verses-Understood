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
  { id: 'sunrise', label: 'Sunrise', from: '#1b3f77', via: '#5d8fc8', to: '#ffd6a0' },
  { id: 'day', label: 'Daylight', from: '#0f4a94', via: '#3d8fd8', to: '#c4e2f6' },
  { id: 'golden', label: 'Golden hour', from: '#16305a', via: '#4f7fb5', to: '#f5c07a' },
  { id: 'night', label: 'Night sky', from: '#050f26', via: '#132c53', to: '#2f5379' },
] as const;

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
          <div className="rounded-xl bg-[rgb(9_22_44/0.72)] p-4 backdrop-blur-md">
            <p className="font-serif text-[1.0625rem] leading-[1.7rem] text-white">
              “{passage.text.length > 260 ? `${passage.text.slice(0, 258)}…` : passage.text}”
            </p>
            <p className="mt-3 text-ui-xs font-semibold text-[rgb(var(--gold))]">
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
  glow.addColorStop(0, 'rgba(255, 226, 165, 0.4)');
  glow.addColorStop(1, 'rgba(255, 226, 165, 0)');
  context.fillStyle = glow;
  context.fillRect(0, 0, size, size);

  // The panel the words sit on, so they are always readable.
  const margin = 88;
  const panelWidth = size - margin * 2;
  context.fillStyle = 'rgba(9, 22, 44, 0.74)';
  roundedRect(context, margin, margin, panelWidth, size - margin * 2, 44);
  context.fill();

  const text = passage.text.length > 420 ? `${passage.text.slice(0, 418)}…` : passage.text;
  context.fillStyle = '#F4F8FF';
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
  context.fillStyle = '#F4C65C';
  context.fillText(`${passage.reference.reference} · ${passage.translation}`, margin + 56, y + 34);

  context.font = '500 26px Inter, system-ui, sans-serif';
  context.fillStyle = 'rgba(232, 240, 255, 0.75)';
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
