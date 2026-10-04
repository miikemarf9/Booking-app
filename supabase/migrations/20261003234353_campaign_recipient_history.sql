-- Extend the existing manual marketing campaign log. Historic sends stay explicitly legacy.
alter table public.marketing_email_campaigns
  add column request_id uuid,
  add column audience_type text not null default 'legacy',
  add column status text not null default 'legacy' check (status in ('legacy','queued','sending','sent','partial','failed','excluded','needs_review')),
  add column excluded_count integer not null default 0 check (excluded_count >= 0),
  add column started_at timestamptz,
  add column completed_at timestamptz,
  add constraint marketing_campaign_request_unique unique (profile_id, request_id),
  add constraint marketing_campaign_owner_unique unique (id, profile_id);
create index marketing_campaign_owner_date on public.marketing_email_campaigns (profile_id, created_at desc);

create table public.marketing_campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null,
  profile_id uuid not null,
  customer_id uuid references public.customers(id) on delete set null,
  customer_name text not null,
  email text not null,
  status text not null check (status in ('pending','sent','delivered','failed','excluded','unknown','delivery_failed')),
  exclusion_reason text,
  error_message text,
  provider_message_id text,
  sent_at timestamptz,
  delivered_at timestamptz,
  delivery_checked_at timestamptz,
  provider_event text,
  created_at timestamptz not null default now(),
  foreign key (campaign_id, profile_id) references public.marketing_email_campaigns(id, profile_id) on delete cascade,
  unique (campaign_id, customer_id)
);
create index marketing_recipients_owner_campaign on public.marketing_campaign_recipients(profile_id, campaign_id);
create index marketing_recipients_customer on public.marketing_campaign_recipients(customer_id);
alter table public.marketing_campaign_recipients enable row level security;
alter table public.marketing_email_campaigns enable row level security;
revoke all on public.marketing_campaign_recipients from anon, authenticated;
grant select on public.marketing_campaign_recipients, public.marketing_email_campaigns to authenticated;
grant all on public.marketing_campaign_recipients, public.marketing_email_campaigns to service_role;
create policy "Owners read own campaign recipients" on public.marketing_campaign_recipients
  for select to authenticated using ((select auth.uid()) = profile_id);

-- Only the authenticated Edge Function's service client may create immutable send snapshots.
-- SECURITY INVOKER deliberately does not grant caller privilege escalation.
create function public.record_marketing_campaign(
  p_profile_id uuid, p_request_id uuid, p_subject text, p_message_text text,
  p_audience_type text, p_recipients jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_campaign public.marketing_email_campaigns;
begin
  if jsonb_typeof(p_recipients) <> 'array' or jsonb_array_length(p_recipients) not between 1 and 1000 then
    raise exception 'Invalid campaign audience';
  end if;
  if exists (select 1 from jsonb_array_elements(p_recipients) r
    where not exists (select 1 from public.customers c where c.id = (r->>'customer_id')::uuid and c.profile_id = p_profile_id)) then
    raise exception 'Audience does not belong to this business';
  end if;
  insert into public.marketing_email_campaigns(profile_id, request_id, subject, message_text, requested_count, audience_type, status, excluded_count)
    values(p_profile_id, p_request_id, p_subject, p_message_text, jsonb_array_length(p_recipients), p_audience_type, 'queued',
      (select count(*) from jsonb_array_elements(p_recipients) r where r->>'status' = 'excluded'))
    on conflict (profile_id, request_id) do nothing returning * into v_campaign;
  if not found then
    select * into v_campaign from public.marketing_email_campaigns where profile_id=p_profile_id and request_id=p_request_id;
    return jsonb_build_object('created', false, 'campaign', to_jsonb(v_campaign));
  end if;
  insert into public.marketing_campaign_recipients(campaign_id, profile_id, customer_id, customer_name, email, status, exclusion_reason)
    select v_campaign.id, p_profile_id, (r->>'customer_id')::uuid, coalesce(r->>'customer_name','Customer'), r->>'email', r->>'status', r->>'exclusion_reason'
      from jsonb_array_elements(p_recipients) r;
  return jsonb_build_object('created', true, 'campaign', to_jsonb(v_campaign));
end $$;
revoke all on function public.record_marketing_campaign(uuid,uuid,text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.record_marketing_campaign(uuid,uuid,text,text,text,jsonb) to service_role;
