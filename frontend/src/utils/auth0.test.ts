import { describe, expect, it } from 'vitest';
import { auth0ProviderOptions } from './auth0';

describe('auth0ProviderOptions', () => {
  it('uses persistent storage without placing tokens in the redirect URL', () => {
    expect(auth0ProviderOptions(
      'tenant.eu.auth0.com',
      'client-id',
      'https://api.athlora.app',
      'http://localhost:5173',
    )).toEqual({
      domain: 'tenant.eu.auth0.com',
      clientId: 'client-id',
      cacheLocation: 'localstorage',
      authorizationParams: {
        audience: 'https://api.athlora.app',
        redirect_uri: 'http://localhost:5173',
        scope: 'openid profile email',
      },
    });
  });
});
