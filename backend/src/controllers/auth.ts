import type { RequestHandler } from 'express';
import { getPool } from '../db/client.js';
import { ApiError } from '../middleware/errors.js';
import type { User } from '../types/domain.js';

interface Auth0Profile {
  sub?: unknown;
  name?: unknown;
  nickname?: unknown;
  email?: unknown;
}

interface UserRow {
  id: string;
  auth0Id: string;
  name: string;
  email: string;
  role: User['role'];
  createdAt: Date;
  updatedAt: Date;
}

export const syncCurrentUser: RequestHandler = async (req, res, next) => {
  const domain = process.env.AUTH0_DOMAIN;
  const subject = req.user?.sub;
  const accessToken = req.accessToken;

  if (!domain || !subject || !accessToken) {
    next(new ApiError(500, 'AUTH_CONTEXT_MISSING', 'Verified authentication context is missing'));
    return;
  }

  try {
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
    if (typeof profile.email !== 'string' || profile.email.length === 0) {
      throw new ApiError(422, 'AUTH_EMAIL_REQUIRED', 'The Auth0 profile must include an email address');
    }

    const name =
      typeof profile.name === 'string' && profile.name.length > 0
        ? profile.name
        : typeof profile.nickname === 'string' && profile.nickname.length > 0
          ? profile.nickname
          : profile.email;

    const result = await getPool().query<UserRow>(
      `INSERT INTO users (auth0_id, name, email)
       VALUES ($1, $2, $3)
       ON CONFLICT (auth0_id) DO UPDATE
       SET name = EXCLUDED.name,
           email = EXCLUDED.email,
           updated_at = now()
       RETURNING id,
                 auth0_id AS "auth0Id",
                 name,
                 email,
                 role,
                 created_at AS "createdAt",
                 updated_at AS "updatedAt"`,
      [subject, name, profile.email],
    );
    const user = result.rows[0];

    res.json({
      data: {
        ...user,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
};
