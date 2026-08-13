import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Auth0Provider } from '@auth0/auth0-react';
import './styles/global.css';
import App from './App';
import { Auth0TokenBridge } from './features/auth/Auth0TokenBridge';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element #root not found');
}

const domain = import.meta.env.VITE_AUTH0_DOMAIN;
const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID;
const audience = import.meta.env.VITE_AUTH0_AUDIENCE;

if (!domain || !clientId || !audience) {
  throw new Error('Auth0 environment variables are not configured');
}

createRoot(rootElement).render(
  <StrictMode>
    <Auth0Provider
      domain={domain}
      clientId={clientId}
      authorizationParams={{
        audience,
        redirect_uri: window.location.origin,
        scope: 'openid profile email',
      }}
    >
      <Auth0TokenBridge>
        <App />
      </Auth0TokenBridge>
    </Auth0Provider>
  </StrictMode>,
);
