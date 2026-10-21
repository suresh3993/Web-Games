import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import type { GameSummary } from '@playverse/shared-types';
import { GameCard } from './game/game-card';
import { FormField } from './ui/form-field';

const game: GameSummary = {
  id: 'g1',
  slug: 'snake',
  title: 'Snake',
  shortDescription: 'Eat orbs and grow.',
  thumbnailUrl: null,
  difficulty: 'EASY',
  supportedDevices: ['DESKTOP', 'MOBILE'],
  estimatedMinutes: 5,
  status: 'COMING_SOON',
  playable: false,
  isFeatured: true,
  supportsScores: true,
  primaryCategory: { slug: 'arcade', name: 'Arcade', icon: 'Joystick', accentColor: '#7c5cff' },
};

describe('GameCard', () => {
  it('links to the details page and shows honest availability', () => {
    render(
      <MemoryRouter>
        <GameCard game={game} />
      </MemoryRouter>,
    );
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/games/snake');
    expect(link).toHaveTextContent('Snake');
    expect(link).toHaveTextContent('Coming soon');
    expect(link).not.toHaveTextContent('Play now');
    expect(link).toHaveTextContent('Easy');
  });

  it('shows "Play now" only for playable games', () => {
    render(
      <MemoryRouter>
        <GameCard game={{ ...game, status: 'PUBLISHED', playable: true }} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link')).toHaveTextContent('Play now');
  });
});

describe('FormField', () => {
  it('associates label, hint and error for assistive technology', () => {
    render(<FormField label="Email" hint="We never share it" error="Enter a valid email address" />);
    const input = screen.getByLabelText('Email');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Enter a valid email address');
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid email address');
  });

  it('lets users reveal and hide a password', async () => {
    const user = userEvent.setup();
    render(<FormField label="Password" type="password" />);
    const input = screen.getByLabelText('Password');
    expect(input).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(input).toHaveAttribute('type', 'text');
    await user.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(input).toHaveAttribute('type', 'password');
  });
});
