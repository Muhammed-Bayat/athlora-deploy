export function auth0ProviderOptions(
  domain: string,
  clientId: string,
  audience: string,
  origin: string,
) {
  return {
    domain,
    clientId,
    // Persist the SPA cache so Auth0 can restore an existing session after reload.
    cacheLocation: 'localstorage' as const,
    authorizationParams: {
      audience,
      redirect_uri: origin,
      scope: 'openid profile email',
    },
  };
}
