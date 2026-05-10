-- ============================================================
-- Nobi — Supabase Schema
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- Enums
-- ============================================================

CREATE TYPE member_role AS ENUM ('admin', 'editor', 'viewer');
CREATE TYPE invite_status AS ENUM ('pending', 'accepted');

-- ============================================================
-- Tables
-- ============================================================

CREATE TABLE profiles (
  id            uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name  text,
  created_at    timestamptz DEFAULT now()
);

CREATE TABLE organisations (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        text NOT NULL,
  slug        text NOT NULL UNIQUE,
  created_at  timestamptz DEFAULT now()
);

CREATE TABLE memberships (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id      uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  role        member_role NOT NULL DEFAULT 'viewer',
  created_at  timestamptz DEFAULT now(),
  UNIQUE (user_id, org_id)
);

CREATE TABLE invitations (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id      uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  email       text NOT NULL,
  role        member_role NOT NULL DEFAULT 'viewer',
  invited_by  uuid NOT NULL REFERENCES auth.users(id),
  status      invite_status NOT NULL DEFAULT 'pending',
  created_at  timestamptz DEFAULT now()
);

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX ON memberships (user_id);
CREATE INDEX ON memberships (org_id);
CREATE INDEX ON invitations (email, status);

-- ============================================================
-- Signup Trigger
-- Runs on every new auth.users insert.
-- If a pending invitation exists for the user's email → join that org.
-- Otherwise → auto-create a personal org and assign admin role.
-- ============================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  pending_invite  invitations%ROWTYPE;
  new_org_id      uuid;
  base_slug       text;
  final_slug      text;
BEGIN
  -- Create profile
  INSERT INTO profiles (id, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
  );

  -- Check for a pending invitation matching this email
  SELECT * INTO pending_invite
  FROM invitations
  WHERE email = NEW.email AND status = 'pending'
  LIMIT 1;

  IF pending_invite.id IS NOT NULL THEN
    -- Join the inviting org with the assigned role
    INSERT INTO memberships (user_id, org_id, role)
    VALUES (NEW.id, pending_invite.org_id, pending_invite.role);

    UPDATE invitations SET status = 'accepted' WHERE id = pending_invite.id;
  ELSE
    -- Build a unique slug from display name or email prefix + short UUID
    base_slug := lower(regexp_replace(
      COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
      '[^a-z0-9]+', '-', 'g'
    ));
    final_slug := base_slug || '-' || substr(NEW.id::text, 1, 8);

    -- Auto-create personal org
    INSERT INTO organisations (name, slug)
    VALUES (
      COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)) || '''s workspace',
      final_slug
    )
    RETURNING id INTO new_org_id;

    -- Assign admin role in the new org
    INSERT INTO memberships (user_id, org_id, role)
    VALUES (NEW.id, new_org_id, 'admin');
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE profiles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE organisations ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships  ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations  ENABLE ROW LEVEL SECURITY;

-- Helper: returns the current user's role in a given org
-- SECURITY DEFINER avoids recursive RLS checks on memberships
CREATE OR REPLACE FUNCTION user_org_role(org uuid)
RETURNS text
LANGUAGE sql
SECURITY DEFINER STABLE SET search_path = public
AS $$
  SELECT role::text FROM memberships
  WHERE user_id = auth.uid() AND org_id = org
  LIMIT 1;
$$;

-- profiles: users can read any profile, update only their own
CREATE POLICY "profiles: read all"
  ON profiles FOR SELECT USING (true);

CREATE POLICY "profiles: update own"
  ON profiles FOR UPDATE USING (auth.uid() = id);

-- organisations: members can read their org, admins can update it
CREATE POLICY "organisations: members can read"
  ON organisations FOR SELECT
  USING (user_org_role(id) IS NOT NULL);

CREATE POLICY "organisations: admins can update"
  ON organisations FOR UPDATE
  USING (user_org_role(id) = 'admin');

-- memberships: members can read their org's memberships, admins can manage them
CREATE POLICY "memberships: members can read"
  ON memberships FOR SELECT
  USING (user_org_role(org_id) IS NOT NULL);

CREATE POLICY "memberships: admins can insert"
  ON memberships FOR INSERT
  WITH CHECK (user_org_role(org_id) = 'admin');

CREATE POLICY "memberships: admins can delete others"
  ON memberships FOR DELETE
  USING (user_id != auth.uid() AND user_org_role(org_id) = 'admin');

-- invitations: admins can read and create invitations for their org
CREATE POLICY "invitations: admins can read"
  ON invitations FOR SELECT
  USING (user_org_role(org_id) = 'admin');

CREATE POLICY "invitations: admins can insert"
  ON invitations FOR INSERT
  WITH CHECK (user_org_role(org_id) = 'admin');
