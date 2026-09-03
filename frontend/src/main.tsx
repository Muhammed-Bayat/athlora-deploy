import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Auth0Provider } from '@auth0/auth0-react';
import './styles/global.css';
import App from './App';
import { Auth0TokenBridge } from './features/auth/Auth0TokenBridge';
import { BrowserRouter } from 'react-router-dom';
import { PublicLoggerPage } from './features/publicLogger/PublicLoggerPage';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element #root not found');
}

const domain = import.meta.env.VITE_AUTH0_DOMAIN;
const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID;
const audience = import.meta.env.VITE_AUTH0_AUDIENCE;

const isPublicLoggerRoute = /^\/log\/[^/]+$/.test(window.location.pathname);

if (!isPublicLoggerRoute && (!domain || !clientId || !audience)) {
  throw new Error('Auth0 environment variables are not configured');
}

createRoot(rootElement).render(
  <StrictMode>
    {isPublicLoggerRoute ? <BrowserRouter><PublicLoggerPage /></BrowserRouter> :
    <Auth0Provider
      domain={domain!}
      clientId={clientId!}
      authorizationParams={{
          audience: audience!,
        redirect_uri: window.location.origin,
        scope: 'openid profile email',
      }}
      onRedirectCallback={(appState) => {
        const returnTo = appState?.returnTo;
        const target = typeof returnTo === 'string' && (returnTo.startsWith('/console') || /^\/(?:invitations|fixture-invitations)\/[^/]+$/.test(returnTo))
          ? returnTo
          : '/console';
        window.history.replaceState({}, '', target);
      }}
    >
      <Auth0TokenBridge>
        <App />
      </Auth0TokenBridge>
    </Auth0Provider>}
  </StrictMode>,
);
