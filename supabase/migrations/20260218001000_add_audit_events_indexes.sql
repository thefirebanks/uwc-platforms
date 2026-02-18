create index if not exists idx_audit_events_created_at on public.audit_events(created_at desc);
create index if not exists idx_audit_events_action_created_at on public.audit_events(action, created_at desc);
create index if not exists idx_audit_events_application_created_at
  on public.audit_events(application_id, created_at desc);
create index if not exists idx_audit_events_actor_created_at on public.audit_events(actor_id, created_at desc);
