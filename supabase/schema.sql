-- ============================================================
-- Nobi — Supabase Schema (Phase 8: Departments + Permissions)
-- ============================================================
-- Apply on a fresh database. The leading DROPs make the file
-- idempotent against a previous Phase 1–7 schema; remove them
-- once you have a stable baseline you care about preserving.

-- Tables first (CASCADE removes their RLS policies, which may reference the
-- helper functions below). Functions are dropped after so they have no
-- lingering dependents. The CASCADE on each function drop is belt-and-braces.
DROP TRIGGER  IF EXISTS on_auth_user_created ON auth.users;
DROP TABLE    IF EXISTS invitations    CASCADE;
DROP TABLE    IF EXISTS memberships    CASCADE;
DROP TABLE    IF EXISTS departments    CASCADE;
DROP TABLE    IF EXISTS organisations  CASCADE;
DROP TABLE    IF EXISTS profiles       CASCADE;
DROP FUNCTION IF EXISTS handle_new_user()                          CASCADE;
DROP FUNCTION IF EXISTS user_org_role(uuid)                        CASCADE;
DROP FUNCTION IF EXISTS user_can(uuid, uuid, text)                 CASCADE;
DROP FUNCTION IF EXISTS role_default_permissions(member_role)      CASCADE;
DROP FUNCTION IF EXISTS create_org(text)                           CASCADE;
DROP FUNCTION IF EXISTS create_org(text, uuid)                     CASCADE;
DROP TYPE     IF EXISTS invite_status;
DROP TYPE     IF EXISTS member_role;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- Enums
-- ============================================================

CREATE TYPE member_role AS ENUM ('admin', 'editor', 'viewer');
CREATE TYPE invite_status AS ENUM ('pending', 'accepted', 'rejected', 'revoked');

-- ============================================================
-- Tables
-- ============================================================

CREATE TABLE profiles (
  id                  uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name        text,
  email               text,
  is_platform_admin   boolean NOT NULL DEFAULT false,
  created_at          timestamptz DEFAULT now()
);

CREATE TABLE organisations (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        text NOT NULL,
  created_at  timestamptz DEFAULT now()
);

CREATE TABLE departments (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id      uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  name        text NOT NULL,
  is_hq       boolean NOT NULL DEFAULT false,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (org_id, name)
);

-- Exactly one HQ per org
CREATE UNIQUE INDEX departments_one_hq_per_org
  ON departments (org_id) WHERE is_hq = true;

CREATE TABLE memberships (
  id                 uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id            uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  department_id      uuid NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  role               member_role NOT NULL DEFAULT 'viewer',
  extra_permissions  text[] NOT NULL DEFAULT '{}',
  created_at         timestamptz DEFAULT now(),
  UNIQUE (user_id, department_id)
);

CREATE TABLE invitations (
  id                 uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  department_id      uuid NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  invitee_user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role               member_role NOT NULL DEFAULT 'viewer',
  extra_permissions  text[] NOT NULL DEFAULT '{}',
  invited_by         uuid NOT NULL REFERENCES auth.users(id),
  status             invite_status NOT NULL DEFAULT 'pending',
  created_at         timestamptz DEFAULT now()
);

-- At most one pending invite per (user, department)
CREATE UNIQUE INDEX invitations_one_pending_per_user_dept
  ON invitations (invitee_user_id, department_id) WHERE status = 'pending';

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX ON memberships (user_id);
CREATE INDEX ON memberships (department_id);
CREATE INDEX ON departments (org_id);
CREATE INDEX ON invitations (invitee_user_id, status);
CREATE INDEX ON invitations (department_id, status);

-- ============================================================
-- Permission helpers
-- ============================================================

-- Default action permissions per role.
-- These four action strings (`view`, `upload`, `edit`, `delete`, `manage_members`,
-- `manage_departments`) are the canonical permission keys used across backend + frontend.
CREATE OR REPLACE FUNCTION role_default_permissions(p_role member_role)
RETURNS text[]
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE p_role
    WHEN 'admin'  THEN ARRAY['view','upload','edit','delete','manage_members','manage_departments']
    WHEN 'editor' THEN ARRAY['view','upload','edit']
    WHEN 'viewer' THEN ARRAY['view']
  END;
$$;

-- True if `p_user` has `p_action` on `p_dept`.
-- HQ membership in the same org grants the role's permissions across every dept.
CREATE OR REPLACE FUNCTION user_can(p_user uuid, p_dept uuid, p_action text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_perms  text[];
BEGIN
  SELECT org_id INTO v_org_id FROM departments WHERE id = p_dept;
  IF v_org_id IS NULL THEN RETURN false; END IF;

  SELECT role_default_permissions(m.role) || m.extra_permissions
  INTO v_perms
  FROM memberships m
  JOIN departments d ON d.id = m.department_id
  WHERE m.user_id = p_user AND d.org_id = v_org_id AND d.is_hq = true
  LIMIT 1;

  IF v_perms IS NOT NULL AND p_action = ANY (v_perms) THEN RETURN true; END IF;

  SELECT role_default_permissions(m.role) || m.extra_permissions
  INTO v_perms
  FROM memberships m
  WHERE m.user_id = p_user AND m.department_id = p_dept
  LIMIT 1;

  IF v_perms IS NOT NULL AND p_action = ANY (v_perms) THEN RETURN true; END IF;

  RETURN false;
END;
$$;

-- Atomically creates an organisation, its HQ department, and an HQ admin
-- membership for the given user. Called by the backend with the service-role
-- key, so we accept user_id explicitly instead of relying on auth.uid().
-- Returns the new org_id.
CREATE OR REPLACE FUNCTION create_org(p_name text, p_user uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id  uuid;
  v_dept_id uuid;
BEGIN
  IF p_user IS NULL THEN
    RAISE EXCEPTION 'user required';
  END IF;
  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'organisation name required';
  END IF;

  INSERT INTO organisations (name) VALUES (trim(p_name)) RETURNING id INTO v_org_id;
  INSERT INTO departments (org_id, name, is_hq) VALUES (v_org_id, 'HQ', true) RETURNING id INTO v_dept_id;
  INSERT INTO memberships (user_id, department_id, role) VALUES (p_user, v_dept_id, 'admin');

  RETURN v_org_id;
END;
$$;

-- ============================================================
-- Signup Trigger — profile only (no auto-org)
-- ============================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO profiles (id, display_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    NEW.email
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- Row Level Security
-- Backend uses the service role (bypasses RLS). These policies
-- are a defence-in-depth layer for any direct frontend reads.
-- ============================================================

ALTER TABLE profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE organisations ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments   ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships   ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations   ENABLE ROW LEVEL SECURITY;

-- Profiles are searchable by any signed-in user so admins can invite by name/email.
CREATE POLICY "profiles: read"       ON profiles FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "profiles: update own" ON profiles FOR UPDATE USING (auth.uid() = id);

-- All other tables: no SELECT policy → only service-role queries from backend can read them.
