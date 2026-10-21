import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';

/**
 * Reads a one-time `?token=` from the URL into memory, then removes it from the
 * address bar so it does not linger in history or leak via the Referer header.
 */
export function useUrlToken(): string | null {
  const [params] = useSearchParams();
  const [token] = useState(() => params.get('token'));
  const navigate = useNavigate();
  const { pathname } = useLocation();

  useEffect(() => {
    if (params.has('token')) navigate(pathname, { replace: true });
  }, [params, navigate, pathname]);

  return token;
}
