import { esc, type Rng, shuffle } from './util';

/** rank: 1 (Ace) … 13 (King); suit: 0 ♠, 1 ♥, 2 ♦, 3 ♣ */
export interface Card {
  rank: number;
  suit: number;
}

export const SUIT_SYMBOLS = ['♠', '♥', '♦', '♣'] as const;
export const SUIT_NAMES = ['spades', 'hearts', 'diamonds', 'clubs'] as const;
export const RANK_LABELS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;

export const isRed = (c: Card) => c.suit === 1 || c.suit === 2;
export const cardName = (c: Card) => `${RANK_LABELS[c.rank]}${SUIT_SYMBOLS[c.suit]}`;
export const sameCard = (a: Card, b: Card) => a.rank === b.rank && a.suit === b.suit;

export function newDeck(): Card[] {
  const cards: Card[] = [];
  for (let suit = 0; suit < 4; suit++) for (let rank = 1; rank <= 13; rank++) cards.push({ rank, suit });
  return cards;
}

export const shuffledDeck = (random: Rng, decks = 1) => shuffle(random, Array.from({ length: decks }, newDeck).flat());

interface CardHtmlOptions {
  faceDown?: boolean;
  action?: string;
  value?: string | number;
  selected?: boolean;
  dim?: boolean;
  disabled?: boolean;
  label?: string;
}

/** Renders a card as a button (when it has an action) or a static element. */
export function cardHtml(card: Card | null, opts: CardHtmlOptions = {}): string {
  const tag = opts.action ? 'button' : 'div';
  const attrs = opts.action
    ? ` type="button" data-action="${esc(opts.action)}" data-value="${esc(opts.value ?? '')}"${opts.disabled ? ' disabled' : ''}`
    : '';
  if (!card) {
    return `<${tag} class="pv-card empty${opts.selected ? ' sel' : ''}"${attrs} aria-label="${esc(opts.label ?? 'Empty pile')}"></${tag}>`;
  }
  if (opts.faceDown) {
    return `<${tag} class="pv-card back"${attrs} aria-label="${esc(opts.label ?? 'Face-down card')}"></${tag}>`;
  }
  const cls = ['pv-card', isRed(card) ? 'red' : '', opts.selected ? 'sel' : '', opts.dim ? 'dim' : ''].filter(Boolean).join(' ');
  const name = `${RANK_LABELS[card.rank]} of ${SUIT_NAMES[card.suit]}`;
  return `<${tag} class="${cls}"${attrs} aria-label="${esc(opts.label ?? name)}"><span>${RANK_LABELS[card.rank]}${SUIT_SYMBOLS[card.suit]}</span><span class="s">${SUIT_SYMBOLS[card.suit]}</span></${tag}>`;
}
