import { describe, expect, it, vi } from 'vitest';
import { applyMigrations, normalizeSql } from './migrate.js';

const migration = {
  name: '0001_init.sql',
  checksum: 'checksum-1',
  sql: 'CREATE TABLE users (id UUID)',
};

const contractMigration = {
  name: '0002_contract_100m.sql',
  checksum: 'checksum-2',
  sql: 'ALTER TABLE results ADD COLUMN outcome TEXT',
};

const appliedRows = (name: string, checksum: string) => [{ name, checksum }];

describe('normalizeSql', () => {
  it('normalizes CRLF to LF so checksums are platform-independent', () => {
    expect(normalizeSql('CREATE TABLE a (\r\n  id UUID\r\n);\r\n')).toBe(
      'CREATE TABLE a (\n  id UUID\n);\n',
    );
  });

  it('leaves LF-only SQL unchanged', () => {
    expect(normalizeSql('SELECT 1;\n')).toBe('SELECT 1;\n');
  });
});

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

  it('applies 0001 then 0002 in order on a fresh database', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: Array(6).fill({ tableName: null }) })
      .mockResolvedValue({ rows: [] });

    await applyMigrations({ query } as never, [migration, contractMigration]);

    expect(query).toHaveBeenCalledWith(migration.sql);
    expect(query).toHaveBeenCalledWith(contractMigration.sql);
    expect(query).toHaveBeenCalledTimes(7);
  });

  it('applies a pending 0002 on top of a baselined 0001', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: appliedRows('0001_init.sql', 'checksum-1') })
      .mockResolvedValue({ rows: [] });

    await applyMigrations({ query } as never, [migration, contractMigration]);

    expect(query).not.toHaveBeenCalledWith(migration.sql);
    expect(query).toHaveBeenCalledWith(contractMigration.sql);
    expect(query).toHaveBeenCalledWith(
      'INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)',
      [contractMigration.name, contractMigration.checksum],
    );
  });

  it('rejects a modified 0002 that was already applied', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: appliedRows('0002_contract_100m.sql', 'different') });

    await expect(applyMigrations({ query } as never, [migration, contractMigration])).rejects.toThrow(
      `Applied migration ${contractMigration.name} has been modified`,
    );
  });
});
