-- Permit the app's audit INSERT with ON CONFLICT (id) DO NOTHING.
-- The conflict column needs SELECT; returning audit content is unnecessary.
grant select (id),
  insert (id, organization_id, actor_id, action, target_type, target_id, outcome, request_id)
on public.audit_events to service_role;
