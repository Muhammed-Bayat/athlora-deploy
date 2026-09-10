import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Auth0Provider } from '@auth0/auth0-react';
import './styles/global.css';
import App from './App';
import { Auth0TokenBridge } from './features/auth/Auth0TokenBridge';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { PublicLoggerPage } from './features/publicLogger/PublicLoggerPage';
import { PublicStatsPage } from './features/publicStats/PublicStatsPage';
import { auth0ProviderOptions } from './utils/auth0';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element #root not found');
}

const domain = import.meta.env.VITE_AUTH0_DOMAIN;
const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID;
const audience = import.meta.env.VITE_AUTH0_AUDIENCE;

const isPublicLoggerRoute = /^\/log\/[^/]+$/.test(window.location.pathname);
const isPublicStatsRoute = /^\/stats\/?$/.test(window.location.pathname);

if (!isPublicLoggerRoute && !isPublicStatsRoute && (!domain || !clientId || !audience)) {
  throw new Error('Auth0 environment variables are not configured');
}

createRoot(rootElement).render(
  <StrictMode>
    {isPublicLoggerRoute ? <BrowserRouter><Routes><Route path="/log/:token" element={<PublicLoggerPage />} /></Routes></BrowserRouter> :
    isPublicStatsRoute ? <BrowserRouter><Routes><Route path="/stats" element={<PublicStatsPage />} /></Routes></BrowserRouter> :
    <Auth0Provider
      {...auth0ProviderOptions(domain!, clientId!, audience!, window.location.origin)}
      onRedirectCallback={(appState) => {
        const returnTo = appState?.returnTo;
        const target = typeof returnTo === 'string' && (returnTo.startsWith('/console') || /^\/invitations\/[^/]+$/.test(returnTo))
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
