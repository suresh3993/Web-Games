/** Dice helpers shared by Five Dice and Hot Dice. */
export const FACES = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

export function dieHtml(value: number, opts: { action?: string; index?: number; held?: boolean; disabled?: boolean } = {}) {
  const tag = opts.action ? 'button' : 'span';
  const attrs = opts.action ? ` type="button" data-action="${opts.action}" data-value="${opts.index}"${opts.disabled ? ' disabled' : ''}` : '';
  return `<${tag}${attrs} aria-label="Die showing ${value}${opts.held ? ' (held)' : ''}" style="all:unset;${opts.action && !opts.disabled ? 'cursor:pointer;' : ''}display:inline-flex;align-items:center;justify-content:center;width:64px;height:64px;font-size:58px;line-height:1;border-radius:12px;background:${opts.held ? '#3b2f8f' : '#141b3a'};color:${opts.held ? '#fde047' : '#e6e9f5'};box-shadow:${opts.held ? '0 0 0 3px #a78bfa' : 'none'}">${FACES[value] ?? '?'}</${tag}>`;
}

export const counts = (dice: number[]) => {
  const c = [0, 0, 0, 0, 0, 0, 0];
  for (const d of dice) c[d]!++;
  return c;
};
