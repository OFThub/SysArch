import type { Rect } from '@xyflow/react';
import { toPng, toSvg } from 'html-to-image';

const PADDING = 48;

/**
 * Renders the whole diagram (not just what is on screen) by framing the
 * React Flow viewport around the bounds of every node at 1:1 scale. The
 * current theme's canvas color is the background.
 */
export async function canvasImage(kind: 'png' | 'svg', b: Rect | undefined): Promise<string> {
  const viewport = document.querySelector<HTMLElement>('.react-flow__viewport');
  if (!viewport || !b) throw new Error('nothing to export');
  const width = Math.ceil(b.width + PADDING * 2);
  const height = Math.ceil(b.height + PADDING * 2);
  const options = {
    backgroundColor: getComputedStyle(document.body).backgroundColor,
    width,
    height,
    pixelRatio: 2,
    style: {
      width: `${width}px`,
      height: `${height}px`,
      transform: `translate(${PADDING - b.x}px, ${PADDING - b.y}px) scale(1)`,
    },
  };
  return kind === 'png' ? toPng(viewport, options) : toSvg(viewport, options);
}

/** Saves a data URL or a blob under a file name. */
export function download(name: string, data: string | Blob) {
  const url = typeof data === 'string' ? data : URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  if (typeof data !== 'string') setTimeout(() => URL.revokeObjectURL(url), 1000);
}
