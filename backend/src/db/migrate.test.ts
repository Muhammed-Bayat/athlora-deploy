import { describe, expect, it, vi } from 'vitest';
import { applyMigrations } from './migrate.js';

const migration = {
  name: '0001_init.sql',
  checksum: 'checksum-1',
  sql: 'CREATE TABLE users (id UUID)',
};

describe('applyMigrations', () => {
  it('applies and records a pending migration on a fresh database', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: Array(6).fill({ tableName: null }) })
      .mockResolvedValue({ rows: [] });

    await applyMigrations({ query } as never, [migration]);

    expect(query).toHaveBeenCalledWith(migration.sql);
    expect(query).toHaveBeenCalledWith(
      'INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)',
      [migration.name, migration.checksum],
    );
  });

  it('baselines an initial schema that was applied before the runner existed', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: Array(6).fill({ tableName: 'users' }) })
      .mockResolvedValue({ rows: [] });

    await applyMigrations({ query } as never, [migration]);

    expect(query).not.toHaveBeenCalledWith(migration.sql);
    expect(query).toHaveBeenCalledWith(
      'INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)',
      [migration.name, migration.checksum],
    );
  });

  it('rejects a modified migration that was already applied', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ name: migration.name, checksum: 'different' }] });

    await expect(applyMigrations({ query } as never, [migration])).rejects.toThrow(
      `Applied migration ${migration.name} has been modified`,
    );
  });
});
