CREATE TABLE user_preferences (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  dashboard_card_order JSONB NOT NULL DEFAULT '[]'::jsonb,
  dashboard_hidden_cards JSONB NOT NULL DEFAULT '[]'::jsonb,
  dashboard_saved_filters JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, workspace_id)
);
