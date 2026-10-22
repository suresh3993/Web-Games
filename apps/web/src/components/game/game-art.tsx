import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { getCategoryIcon } from './category-icon';

/** Deterministic 32-bit hash so each game always gets the same artwork. */
function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed: number) {
  let s = seed || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 10_000) / 10_000;
  };
}

interface GameArtProps {
  slug: string;
  title: string;
  accentColor: string;
  icon: string;
  thumbnailUrl?: string | null;
  /** Responsive WebP variants for uploaded thumbnails. */
  thumbnailSrcSet?: string | null;
  className?: string;
}

/**
 * Original, procedurally generated cover art (no third-party assets). A real
 * thumbnail, when an admin uploads one, takes precedence and is lazy-loaded.
 */
export function GameArt({ slug, title, accentColor, icon, thumbnailUrl, thumbnailSrcSet, className }: GameArtProps) {
  const art = useMemo(() => {
    const random = rng(hash(slug));
    const pattern = Math.floor(random() * 4);
    const shapes = Array.from({ length: 5 }, () => ({
      kind: Math.floor(random() * 3),
      x: 20 + random() * 280,
      y: 15 + random() * 170,
      size: 10 + random() * 26,
      rotate: random() * 360,
      opacity: 0.12 + random() * 0.25,
    }));
    return {
      pattern,
      shapes,
      angle: Math.floor(random() * 360),
      glowX: 40 + random() * 240,
      glowY: 20 + random() * 120,
    };
  }, [slug]);

  if (thumbnailUrl) {
    return (
      <img
        src={thumbnailUrl}
        srcSet={thumbnailSrcSet ?? undefined}
        sizes="(min-width: 1280px) 320px, (min-width: 768px) 33vw, 100vw"
        width={640}
        height={400}
        alt=""
        loading="lazy"
        decoding="async"
        className={cn('aspect-[16/10] w-full object-cover', className)}
      />
    );
  }

  const Icon = getCategoryIcon(icon);
  const id = `art-${slug}`;
  return (
    // Decorative: the game title is always rendered next to the art.
    <svg
      viewBox="0 0 320 200"
      aria-hidden="true"
      data-title={title}
      className={cn('aspect-[16/10] w-full', className)}
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient id={`${id}-bg`} gradientTransform={`rotate(${art.angle} .5 .5)`}>
          <stop offset="0" stopColor={accentColor} />
          <stop offset="0.55" stopColor="#151b45" />
          <stop offset="1" stopColor="#070a17" />
        </linearGradient>
        <radialGradient id={`${id}-glow`}>
          <stop offset="0" stopColor={accentColor} stopOpacity="0.85" />
          <stop offset="1" stopColor={accentColor} stopOpacity="0" />
        </radialGradient>
        <pattern id={`${id}-p`} width="20" height="20" patternUnits="userSpaceOnUse">
          {art.pattern === 0 && <path d="M20 0H0V20" fill="none" stroke="#fff" strokeOpacity="0.08" />}
          {art.pattern === 1 && <circle cx="10" cy="10" r="1.4" fill="#fff" fillOpacity="0.14" />}
          {art.pattern === 2 && <path d="M0 20L20 0" stroke="#fff" strokeOpacity="0.08" />}
          {art.pattern === 3 && <circle cx="10" cy="10" r="7" fill="none" stroke="#fff" strokeOpacity="0.07" />}
        </pattern>
      </defs>
      <rect width="320" height="200" fill={`url(#${id}-bg)`} />
      <rect width="320" height="200" fill={`url(#${id}-p)`} />
      <circle cx={art.glowX} cy={art.glowY} r="110" fill={`url(#${id}-glow)`} opacity="0.55" />
      {art.shapes.map((s, i) => (
        <g key={i} transform={`translate(${s.x} ${s.y}) rotate(${s.rotate})`} opacity={s.opacity}>
          {s.kind === 0 && <circle r={s.size / 2} fill="none" stroke="#fff" strokeWidth="2" />}
          {s.kind === 1 && <rect x={-s.size / 2} y={-s.size / 2} width={s.size} height={s.size} rx="3" fill="none" stroke="#fff" strokeWidth="2" />}
          {s.kind === 2 && <path d={`M0 ${-s.size / 2}L${s.size / 2} ${s.size / 2}H${-s.size / 2}Z`} fill="none" stroke="#fff" strokeWidth="2" />}
        </g>
      ))}
      <Icon x="118" y="58" width="84" height="84" color="#fff" strokeWidth={1.4} opacity={0.92} aria-hidden="true" />
    </svg>
  );
}
