const HEX_COLOR = /^#([0-9A-Fa-f]{6})$/;

export const WHITE_FOREGROUND = '#FFFFFF';
export const INK_FOREGROUND = '#001D3C';
export const MIN_CONTRAST_RATIO = 4.5;

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_COLOR.test(value);
}

export function normalizeHexColor(value: string): string {
  return value.toUpperCase();
}

function channel(contribution: number): number {
  return contribution <= 0.03928 ? contribution / 12.92 : ((contribution + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hexColor: string): number {
  if (!isHexColor(hexColor)) throw new Error('Expected a #RRGGBB colour');
  const value = HEX_COLOR.exec(hexColor)![1]!;
  const red = channel(Number.parseInt(value.slice(0, 2), 16) / 255);
  const green = channel(Number.parseInt(value.slice(2, 4), 16) / 255);
  const blue = channel(Number.parseInt(value.slice(4, 6), 16) / 255);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

export function contrastRatio(left: string, right: string): number {
  const leftLuminance = relativeLuminance(left);
  const rightLuminance = relativeLuminance(right);
  const lighter = Math.max(leftLuminance, rightLuminance);
  const darker = Math.min(leftLuminance, rightLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

export function hasAccessibleForeground(backgroundColor: string): boolean {
  if (!isHexColor(backgroundColor)) return false;
  return (
    contrastRatio(backgroundColor, WHITE_FOREGROUND) >= MIN_CONTRAST_RATIO
    || contrastRatio(backgroundColor, INK_FOREGROUND) >= MIN_CONTRAST_RATIO
  );
}

export function pickForeground(backgroundColor: string): string {
  if (!isHexColor(backgroundColor)) return INK_FOREGROUND;
  const whiteRatio = contrastRatio(backgroundColor, WHITE_FOREGROUND);
  const inkRatio = contrastRatio(backgroundColor, INK_FOREGROUND);
  return whiteRatio >= inkRatio ? WHITE_FOREGROUND : INK_FOREGROUND;
}
