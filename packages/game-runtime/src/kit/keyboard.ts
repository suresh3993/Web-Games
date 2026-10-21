/** On-screen QWERTY keyboard for word games (works on touch devices). */
const ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];

export function keyboardHtml(states: Record<string, 'hit' | 'near' | 'miss' | undefined> = {}, opts: { enter?: boolean; back?: boolean; disabled?: Set<string> } = {}) {
  const rows = ROWS.map((row, i) => {
    const keys = [...row].map((ch) => {
      const s = states[ch];
      return `<button type="button" class="pv-key${s ? ` ${s}` : ''}" data-action="key" data-value="${ch}" ${opts.disabled?.has(ch) ? 'disabled' : ''} aria-label="${ch.toUpperCase()}">${ch.toUpperCase()}</button>`;
    });
    if (i === 2 && opts.enter) keys.unshift('<button type="button" class="pv-key wide" data-action="key" data-value="enter">Enter</button>');
    if (i === 2 && opts.back) keys.push('<button type="button" class="pv-key wide" data-action="key" data-value="back" aria-label="Backspace">⌫</button>');
    return `<div class="pv-row">${keys.join('')}</div>`;
  });
  return `<div class="pv-keys">${rows.join('')}</div>`;
}

/** Maps a KeyboardEvent to an on-screen key value. */
export function keyFromEvent(e: KeyboardEvent): string | null {
  if (e.key === 'Enter') return 'enter';
  if (e.key === 'Backspace') return 'back';
  if (/^[a-zA-Z]$/.test(e.key)) return e.key.toLowerCase();
  return null;
}
