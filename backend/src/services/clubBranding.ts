import { getPool, type DbExecutor } from '../db/client.js';
import { ApiError } from '../middleware/errors.js';
import type { ClubBranding, ClubBrandSummary } from '../types/domain.js';
import {
  deleteObject,
  getObject,
  publicMediaPath,
  storeBrandImage,
} from './mediaStorage.js';

interface BrandingRow {
  workspace_id: string;
  description: string | null;
  primary_color: string | null;
  accent_color: string | null;
  logo_key: string | null;
  logo_content_type: string | null;
  cover_key: string | null;
  cover_content_type: string | null;
}

const BRANDING_COLUMNS = `
  workspace_id,
  description,
  primary_color,
  accent_color,
  logo_key,
  logo_content_type,
  cover_key,
  cover_content_type
`;

function clubNotFound(): ApiError {
  return new ApiError(404, 'CLUB_NOT_FOUND', 'Club not found');
}

function mapBranding(row: BrandingRow): ClubBranding {
  return {
    description: row.description,
    primaryColor: row.primary_color,
    accentColor: row.accent_color,
    logoUrl: row.logo_key ? publicMediaPath(row.workspace_id, row.logo_key) : null,
    logoContentType: row.logo_content_type,
    coverUrl: row.cover_key ? publicMediaPath(row.workspace_id, row.cover_key) : null,
    coverContentType: row.cover_content_type,
  };
}

export function toBrandSummary(row: Partial<BrandingRow> & { workspace_id?: string }): ClubBrandSummary | undefined {
  if (!row.workspace_id) return undefined;
  return {
    description: row.description ?? null,
    primaryColor: row.primary_color ?? null,
    accentColor: row.accent_color ?? null,
    logoUrl: row.logo_key ? publicMediaPath(row.workspace_id, row.logo_key) : null,
    coverUrl: row.cover_key ? publicMediaPath(row.workspace_id, row.cover_key) : null,
  };
}

export async function getClubBranding(
  workspaceId: string,
  executor: DbExecutor = getPool(),
): Promise<ClubBranding> {
  const result = await executor.query<BrandingRow>(
    `SELECT ${BRANDING_COLUMNS}
     FROM clubs
     WHERE workspace_id = $1`,
    [workspaceId],
  );
  const row = result.rows[0];
  if (!row) throw clubNotFound();
  return mapBranding(row);
}

export async function updateClubBranding(
  workspaceId: string,
  payload: { description: string | null; primaryColor: string | null; accentColor: string | null },
  executor: DbExecutor = getPool(),
): Promise<ClubBranding> {
  const result = await executor.query<BrandingRow>(
    `UPDATE clubs
     SET description = $2,
         primary_color = $3,
         accent_color = $4,
         updated_at = now()
     WHERE workspace_id = $1
     RETURNING ${BRANDING_COLUMNS}`,
    [workspaceId, payload.description, payload.primaryColor, payload.accentColor],
  );
  const row = result.rows[0];
  if (!row) throw clubNotFound();
  return mapBranding(row);
}

async function replaceBrandImage(
  workspaceId: string,
  kind: 'logo' | 'cover',
  buffer: Buffer | null,
): Promise<ClubBranding> {
  const current = await getClubBranding(workspaceId);
  const currentKey = kind === 'logo'
    ? (current.logoUrl ? keyFromUrl(current.logoUrl) : null)
    : (current.coverUrl ? keyFromUrl(current.coverUrl) : null);

  if (buffer === null) {
    await getPool().query(
      kind === 'logo'
        ? 'UPDATE clubs SET logo_key = NULL, logo_content_type = NULL, logo_byte_size = NULL, updated_at = now() WHERE workspace_id = $1'
        : 'UPDATE clubs SET cover_key = NULL, cover_content_type = NULL, cover_byte_size = NULL, updated_at = now() WHERE workspace_id = $1',
      [workspaceId],
    );
    if (currentKey) await deleteObject(currentKey);
    return getClubBranding(workspaceId);
  }

  const stored = await storeBrandImage(workspaceId, kind, buffer);
  const updated = await getPool().query<BrandingRow>(
    kind === 'logo'
      ? `UPDATE clubs SET logo_key = $2, logo_content_type = $3, logo_byte_size = $4, updated_at = now()
         WHERE workspace_id = $1 RETURNING ${BRANDING_COLUMNS}`
      : `UPDATE clubs SET cover_key = $2, cover_content_type = $3, cover_byte_size = $4, updated_at = now()
         WHERE workspace_id = $1 RETURNING ${BRANDING_COLUMNS}`,
    [workspaceId, stored.key, stored.contentType, stored.byteSize],
  );
  const row = updated.rows[0];
  if (!row) throw clubNotFound();
  if (currentKey && currentKey !== stored.key) await deleteObject(currentKey);
  return mapBranding(row);
}

export async function replaceClubLogo(workspaceId: string, buffer: Buffer): Promise<ClubBranding> {
  return replaceBrandImage(workspaceId, 'logo', buffer);
}

export async function clearClubLogo(workspaceId: string): Promise<ClubBranding> {
  return replaceBrandImage(workspaceId, 'logo', null);
}

export async function replaceClubCover(workspaceId: string, buffer: Buffer): Promise<ClubBranding> {
  return replaceBrandImage(workspaceId, 'cover', buffer);
}

export async function clearClubCover(workspaceId: string): Promise<ClubBranding> {
  return replaceBrandImage(workspaceId, 'cover', null);
}

export async function readBrandAsset(
  workspaceId: string,
  filename: string,
): Promise<{ body: Buffer; contentType: string; cacheControl: string }> {
  const key = `clubs/${workspaceId}/${filename}`;
  if (!/^clubs\/[0-9a-f-]{36}\/(logo|cover)-[0-9a-f]{64}\.(png|jpg|webp)$/.test(key)) {
    throw new ApiError(404, 'NOT_FOUND', 'Resource not found');
  }
  try {
    return await getObject(key);
  } catch {
    throw new ApiError(404, 'NOT_FOUND', 'Resource not found');
  }
}

function keyFromUrl(url: string): string | null {
  const match = /\/clubs\/([0-9a-f-]{36}\/(?:logo|cover)-[0-9a-f]{64}\.(?:png|jpg|webp))$/.exec(url);
  return match ? `clubs/${match[1]}` : null;
}
