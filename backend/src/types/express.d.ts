import type { ApplicationUserContext, VerifiedAuth0Context } from './auth.js';

declare global {
  namespace Express {
    interface Request {
      auth0?: VerifiedAuth0Context;
      auth?: ApplicationUserContext;
    }
  }
}

export {};
