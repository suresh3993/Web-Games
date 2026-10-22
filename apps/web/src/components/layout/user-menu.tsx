import { CalendarCheck, Heart, History, LogOut, Medal, MonitorSmartphone, Settings, ShieldCheck, Trophy, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import type { CurrentUser } from '@suresh/shared-types';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { useLogout } from '@/features/auth/api';

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');

const AVATAR_SIZES = { md: 'size-9 text-sm', lg: 'size-12 text-base', xl: 'size-24 text-3xl' } as const;

export function Avatar({ user, size = 'md' }: { user: Pick<CurrentUser, 'displayName' | 'avatarUrl'>; size?: keyof typeof AVATAR_SIZES }) {
  const dimension = AVATAR_SIZES[size];
  return user.avatarUrl ? (
    <img src={user.avatarUrl} alt="" className={`${dimension} rounded-full object-cover`} />
  ) : (
    <span
      aria-hidden="true"
      className={`${dimension} flex items-center justify-center rounded-full bg-gradient-to-br from-[#7c5cff] to-[#22d3ee] font-bold text-white`}
    >
      {initials(user.displayName)}
    </span>
  );
}

export function UserMenu({ user }: { user: CurrentUser }) {
  const navigate = useNavigate();
  const logout = useLogout();
  const logoutAll = useLogout(true);

  const signOut = async (everywhere: boolean) => {
    try {
      await (everywhere ? logoutAll : logout).mutateAsync();
      toast.success(everywhere ? 'Signed out on all devices.' : 'Signed out. See you soon!');
      navigate('/');
    } catch {
      toast.error('Could not sign out. Please try again.');
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="rounded-full" aria-label={`Account menu for ${user.displayName}`}>
        <Avatar user={user} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="flex items-center gap-3">
          <Avatar user={user} size="lg" />
          <div className="min-w-0">
            <p className="truncate font-semibold">{user.displayName}</p>
            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
            <div className="mt-1 flex gap-1">
              <Badge variant="primary">Level {user.level}</Badge>
              <Badge variant="outline">{user.xp} XP</Badge>
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate('/profile')}>
          <UserRound aria-hidden="true" /> Profile
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate('/achievements')}>
          <Medal aria-hidden="true" /> Achievements
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate('/challenges')}>
          <CalendarCheck aria-hidden="true" /> Daily challenges
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate('/favorites')}>
          <Heart aria-hidden="true" /> Favourites
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate('/recently-played')}>
          <History aria-hidden="true" /> Recently played
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate('/leaderboards')}>
          <Trophy aria-hidden="true" /> Leaderboards
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate('/settings')}>
          <Settings aria-hidden="true" /> Settings
        </DropdownMenuItem>
        {(user.role === 'ADMIN' || user.role === 'MODERATOR') && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => navigate('/admin')}>
              <ShieldCheck aria-hidden="true" /> Admin dashboard
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void signOut(false)}>
          <LogOut aria-hidden="true" /> Log out
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void signOut(true)}>
          <MonitorSmartphone aria-hidden="true" /> Log out on all devices
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
