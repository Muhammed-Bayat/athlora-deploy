import type { RequestHandler } from 'express';
import { getPool } from '../db/client.js';
import { mapUserRow, type UserRow } from '../db/row-mappers.js';
import { getVerifiedAuth0Context } from '../middleware/auth.js';
import { ApiError } from '../middleware/errors.js';
import { normalizeRequiredString } from '../validation/primitives.js';

interface Auth0Profile {
  sub?: unknown;
  name?: unknown;
  nickname?: unknown;
  email?: unknown;
}

export const syncCurrentUser: RequestHandler = async (req, res, next) => {
  const domain = process.env.AUTH0_DOMAIN;

  if (!domain) {
    next(new ApiError(500, 'AUTH_CONTEXT_MISSING', 'Verified authentication context is missing'));
    return;
  }

  try {
    const { auth0Id: subject, accessToken } = getVerifiedAuth0Context(req);
    const profileResponse = await fetch(`https://${domain}/userinfo`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!profileResponse.ok) {
      throw new ApiError(502, 'AUTH_PROFILE_UNAVAILABLE', 'Could not retrieve the Auth0 profile');
    }

    const profile = (await profileResponse.json()) as Auth0Profile;
    if (profile.sub !== subject) {
      throw new ApiError(401, 'UNAUTHORIZED', 'Auth0 profile does not match the access token');
    }
    const email = normalizeRequiredString(profile.email);
    if (email === null) {
      throw new ApiError(422, 'AUTH_EMAIL_REQUIRED', 'The Auth0 profile must include an email address');
    }

    const name =
      normalizeRequiredString(profile.name) ?? normalizeRequiredString(profile.nickname) ?? email;

    const result = await getPool().query<UserRow>(
      `INSERT INTO users (auth0_id, name, email)
       VALUES ($1, $2, $3)
       ON CONFLICT (auth0_id) DO UPDATE
       SET name = EXCLUDED.name,
           email = EXCLUDED.email,
           updated_at = now()
       RETURNING id,
                  auth0_id,
                  name,
                  email,
                  role,
                  created_at,
                  updated_at`,
      [subject, name, email],
    );
    res.json({ data: mapUserRow(result.rows[0]) });
  } catch (error) {
    next(error);
  }
};
