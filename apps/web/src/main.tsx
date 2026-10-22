import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { AppProviders } from './app/providers';
import { createAppRouter } from './app/router';
import { currentUserQuery } from './features/auth/api';
import { createQueryClient } from './lib/query-client';
import './styles/globals.css';

const queryClient = createQueryClient();
// Ask who is signed in right away, in parallel with the route's code, instead of after the first render.
void queryClient.prefetchQuery(currentUserQuery);
const router = createAppRouter(queryClient);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders queryClient={queryClient}>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
);
