-- Shared flatten query for effective permission keys of one user.
-- Loaded by Python (rbac.store) and auth (users.ts). Keep both copies identical.
--
-- Token placeholders appear once each in the params CTE below.
-- P1 = user id (uuid); P2 = max nesting depth (int, inclusive; assigned roles are depth 1).
-- Runtimes substitute tokens for their driver placeholders (psycopg vs node-pg).
--
-- Result columns:
--   has_cycle      boolean  — true if a role_child cycle was encountered
--   depth_exceeded boolean  — true if a child edge exists beyond max depth
--   key            text     — permission key (one row per distinct key; may be null
--                            when the set is empty and flags are false)
--
-- Callers must fail closed when has_cycle or depth_exceeded is true.
WITH RECURSIVE
params AS (
  SELECT __P1__::uuid AS user_id, __P2__::int AS max_depth
),
seeds AS (
  SELECT ur.role_id AS role_id
  FROM user_role ur
  CROSS JOIN params p
  WHERE ur.user_id = p.user_id
),
role_tree AS (
  SELECT
    s.role_id AS role_id,
    1 AS depth
  FROM seeds s
  UNION ALL
  SELECT
    rc.child_role_id AS role_id,
    rt.depth + 1 AS depth
  FROM role_tree rt
  INNER JOIN role_child rc ON rc.parent_role_id = rt.role_id
  CROSS JOIN params p
  WHERE rt.depth < p.max_depth
    AND NOT rt.is_cycle
)
CYCLE role_id SET is_cycle USING path,
flags AS (
  SELECT
    EXISTS (SELECT 1 FROM role_tree WHERE is_cycle) AS has_cycle,
    EXISTS (
      SELECT 1
      FROM role_tree rt
      INNER JOIN role_child rc ON rc.parent_role_id = rt.role_id
      CROSS JOIN params p
      WHERE rt.depth >= p.max_depth
        AND NOT rt.is_cycle
    ) AS depth_exceeded
),
keys AS (
  SELECT DISTINCT perm.key AS key
  FROM role_tree rt
  INNER JOIN role_permission rp ON rp.role_id = rt.role_id
  INNER JOIN permission perm ON perm.id = rp.permission_id
  WHERE NOT rt.is_cycle
)
SELECT
  f.has_cycle,
  f.depth_exceeded,
  k.key
FROM flags f
LEFT JOIN keys k ON TRUE
