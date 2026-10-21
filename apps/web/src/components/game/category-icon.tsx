import {
  Brain,
  CarFront,
  Castle,
  Footprints,
  Gamepad2,
  Grid3x3,
  Joystick,
  Layers,
  Puzzle,
  Sigma,
  Spade,
  Sparkles,
  Trophy,
  Type,
  Users,
  type LucideIcon,
  type LucideProps,
} from 'lucide-react';

/** Explicit map keeps the bundle small (no dynamic icon imports). Keys match GameCategory.icon. */
const ICONS: Record<string, LucideIcon> = {
  Joystick,
  Puzzle,
  Brain,
  CarFront,
  Trophy,
  Castle,
  Grid3x3,
  Spade,
  Sparkles,
  Footprints,
  Layers,
  Type,
  Sigma,
  Users,
};

export function getCategoryIcon(name: string | undefined): LucideIcon {
  return (name && ICONS[name]) || Gamepad2;
}

export function CategoryIcon({ name, ...props }: { name: string } & LucideProps) {
  const Icon = getCategoryIcon(name);
  return <Icon aria-hidden="true" {...props} />;
}
