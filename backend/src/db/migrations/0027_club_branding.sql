ALTER TABLE clubs
  ADD COLUMN description TEXT CHECK (description IS NULL OR length(description) <= 500),
  ADD COLUMN primary_color TEXT CHECK (primary_color IS NULL OR primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  ADD COLUMN accent_color TEXT CHECK (accent_color IS NULL OR accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  ADD COLUMN logo_key TEXT,
  ADD COLUMN logo_content_type TEXT,
  ADD COLUMN logo_byte_size INTEGER CHECK (logo_byte_size IS NULL OR (logo_byte_size > 0 AND logo_byte_size <= 5242880)),
  ADD COLUMN cover_key TEXT,
  ADD COLUMN cover_content_type TEXT,
  ADD COLUMN cover_byte_size INTEGER CHECK (cover_byte_size IS NULL OR (cover_byte_size > 0 AND cover_byte_size <= 5242880));
