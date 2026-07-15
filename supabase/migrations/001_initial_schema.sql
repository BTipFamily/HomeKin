-- ============================================================
-- HomeKin: Family Reunion App
-- Initial schema + RLS policies
-- Run this in your Supabase SQL editor (or via supabase db push)
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================
-- TABLES
-- ============================================================

create table members (
  id uuid primary key default uuid_generate_v4(),
  auth_user_id uuid references auth.users(id) on delete set null unique,
  name text not null,
  email text not null unique,
  phone text,
  address text,
  family_branch text,
  bio text,
  photo_url text,
  social_links jsonb not null default '{"facebook": null, "instagram": null, "linkedin": null}',
  role text not null default 'member' check (role in ('member', 'committee', 'admin')),
  created_by_proxy boolean not null default false,
  visibility_settings jsonb not null default '{"phone": "members", "address": "members", "email": "members"}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table reunions (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  year integer not null,
  description text,
  created_by uuid references members(id) on delete set null,
  created_at timestamptz not null default now()
);

create table sub_events (
  id uuid primary key default uuid_generate_v4(),
  reunion_id uuid not null references reunions(id) on delete cascade,
  name text not null,
  description text,
  date date not null,
  time time,
  location_name text,
  address text,
  cost_per_person numeric(10, 2) not null default 0,
  capacity integer,
  created_by uuid references members(id) on delete set null,
  created_at timestamptz not null default now()
);

create table signups (
  id uuid primary key default uuid_generate_v4(),
  sub_event_id uuid not null references sub_events(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  headcount integer not null default 1 check (headcount >= 1),
  guest_names text,
  status text not null default 'pending' check (status in ('pending', 'confirmed')),
  created_at timestamptz not null default now(),
  unique(sub_event_id, member_id)
);

create table balances (
  id uuid primary key default uuid_generate_v4(),
  member_id uuid not null references members(id) on delete cascade,
  reunion_id uuid not null references reunions(id) on delete cascade,
  sub_event_id uuid references sub_events(id) on delete cascade,
  amount_owed numeric(10, 2) not null default 0,
  amount_paid numeric(10, 2) not null default 0,
  payment_method text check (payment_method in ('stripe', 'zelle', 'cashapp', 'check', 'other')),
  stripe_checkout_session_id text,
  status text not null default 'unpaid' check (status in ('unpaid', 'partially_paid', 'paid', 'pending_confirmation')),
  updated_at timestamptz not null default now()
);

create table announcements (
  id uuid primary key default uuid_generate_v4(),
  reunion_id uuid not null references reunions(id) on delete cascade,
  title text not null,
  body text not null,
  pinned boolean not null default false,
  sent_via_email boolean not null default false,
  created_by uuid references members(id) on delete set null,
  created_at timestamptz not null default now()
);

create table invitations (
  id uuid primary key default uuid_generate_v4(),
  reunion_id uuid not null references reunions(id) on delete cascade,
  sub_event_id uuid references sub_events(id) on delete cascade,
  member_id uuid references members(id) on delete cascade,
  token text not null unique default encode(gen_random_bytes(32), 'hex'),
  sent_at timestamptz,
  opened_at timestamptz,
  responded_at timestamptz,
  created_at timestamptz not null default now()
);

-- Invite codes for the signup flow
create table invite_codes (
  id uuid primary key default uuid_generate_v4(),
  code text not null unique default upper(substring(encode(gen_random_bytes(6), 'hex'), 1, 8)),
  reunion_id uuid references reunions(id) on delete set null,
  created_by uuid references members(id) on delete set null,
  used_by uuid references members(id) on delete set null,
  used_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table surveys (
  id uuid primary key default uuid_generate_v4(),
  reunion_id uuid not null references reunions(id) on delete cascade,
  title text not null,
  questions jsonb not null default '[]',
  created_by uuid references members(id) on delete set null,
  created_at timestamptz not null default now()
);

create table survey_responses (
  id uuid primary key default uuid_generate_v4(),
  survey_id uuid not null references surveys(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  answers jsonb not null default '{}',
  submitted_at timestamptz not null default now(),
  unique(survey_id, member_id)
);

create table photos (
  id uuid primary key default uuid_generate_v4(),
  reunion_id uuid not null references reunions(id) on delete cascade,
  sub_event_id uuid references sub_events(id) on delete cascade,
  uploaded_by uuid references members(id) on delete set null,
  storage_path text not null,
  caption text,
  tagged_members uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

create table messages (
  id uuid primary key default uuid_generate_v4(),
  reunion_id uuid not null references reunions(id) on delete cascade,
  sub_event_id uuid references sub_events(id) on delete cascade,
  sender_id uuid references members(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);

create table direct_messages (
  id uuid primary key default uuid_generate_v4(),
  sender_id uuid references members(id) on delete set null,
  recipient_id uuid references members(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

-- ============================================================
-- HELPER FUNCTION: get current member's role
-- ============================================================

create or replace function get_my_role()
returns text
language sql
security definer
stable
as $$
  select role from members where auth_user_id = auth.uid()
$$;

create or replace function get_my_member_id()
returns uuid
language sql
security definer
stable
as $$
  select id from members where auth_user_id = auth.uid()
$$;

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================

create or replace function handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger members_updated_at
  before update on members
  for each row execute function handle_updated_at();

create trigger balances_updated_at
  before update on balances
  for each row execute function handle_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table members enable row level security;
alter table reunions enable row level security;
alter table sub_events enable row level security;
alter table signups enable row level security;
alter table balances enable row level security;
alter table announcements enable row level security;
alter table invitations enable row level security;
alter table invite_codes enable row level security;
alter table surveys enable row level security;
alter table survey_responses enable row level security;
alter table photos enable row level security;
alter table messages enable row level security;
alter table direct_messages enable row level security;

-- ---- members ----
create policy "Members: authenticated users can view all" on members
  for select to authenticated using (true);

create policy "Members: users can insert their own record" on members
  for insert to authenticated
  with check (auth_user_id = auth.uid());

create policy "Members: users can update own record" on members
  for update to authenticated
  using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid());

create policy "Members: committee/admin can update any record" on members
  for update to authenticated
  using (get_my_role() in ('committee', 'admin'));

create policy "Members: admin can insert proxy records" on members
  for insert to authenticated
  with check (
    created_by_proxy = true and get_my_role() = 'admin'
  );

-- ---- reunions ----
create policy "Reunions: authenticated users can view" on reunions
  for select to authenticated using (true);

create policy "Reunions: committee/admin can create" on reunions
  for insert to authenticated
  with check (get_my_role() in ('committee', 'admin'));

create policy "Reunions: committee/admin can update" on reunions
  for update to authenticated
  using (get_my_role() in ('committee', 'admin'));

-- ---- sub_events ----
create policy "SubEvents: authenticated users can view" on sub_events
  for select to authenticated using (true);

create policy "SubEvents: committee/admin can create" on sub_events
  for insert to authenticated
  with check (get_my_role() in ('committee', 'admin'));

create policy "SubEvents: committee/admin can update" on sub_events
  for update to authenticated
  using (get_my_role() in ('committee', 'admin'));

-- ---- signups ----
create policy "Signups: members see own; committee/admin see all" on signups
  for select to authenticated
  using (
    member_id = get_my_member_id()
    or get_my_role() in ('committee', 'admin')
  );

create policy "Signups: members can sign up themselves" on signups
  for insert to authenticated
  with check (member_id = get_my_member_id());

create policy "Signups: members can update own; committee can update any" on signups
  for update to authenticated
  using (
    member_id = get_my_member_id()
    or get_my_role() in ('committee', 'admin')
  );

create policy "Signups: members can delete own" on signups
  for delete to authenticated
  using (member_id = get_my_member_id());

-- ---- balances ----
create policy "Balances: members see own; committee/admin see all" on balances
  for select to authenticated
  using (
    member_id = get_my_member_id()
    or get_my_role() in ('committee', 'admin')
  );

create policy "Balances: committee/admin can insert" on balances
  for insert to authenticated
  with check (get_my_role() in ('committee', 'admin'));

create policy "Balances: committee/admin can update" on balances
  for update to authenticated
  using (get_my_role() in ('committee', 'admin'));

-- ---- announcements ----
create policy "Announcements: authenticated users can view" on announcements
  for select to authenticated using (true);

create policy "Announcements: committee/admin can create" on announcements
  for insert to authenticated
  with check (get_my_role() in ('committee', 'admin'));

create policy "Announcements: committee/admin can update" on announcements
  for update to authenticated
  using (get_my_role() in ('committee', 'admin'));

create policy "Announcements: committee/admin can delete" on announcements
  for delete to authenticated
  using (get_my_role() in ('committee', 'admin'));

-- ---- photos ----
create policy "Photos: authenticated users can view" on photos
  for select to authenticated using (true);

create policy "Photos: authenticated users can upload" on photos
  for insert to authenticated
  with check (uploaded_by = get_my_member_id());

create policy "Photos: uploader or admin can delete" on photos
  for delete to authenticated
  using (
    uploaded_by = get_my_member_id()
    or get_my_role() = 'admin'
  );

-- ---- invite_codes ----
create policy "InviteCodes: admin can view" on invite_codes
  for select to authenticated
  using (get_my_role() = 'admin');

create policy "InviteCodes: admin can create" on invite_codes
  for insert to authenticated
  with check (get_my_role() = 'admin');

create policy "InviteCodes: anon can look up code by value (for signup)" on invite_codes
  for select to anon using (true);

-- ---- messages ----
create policy "Messages: authenticated users can view reunion messages" on messages
  for select to authenticated using (true);

create policy "Messages: authenticated users can post" on messages
  for insert to authenticated
  with check (sender_id = get_my_member_id());

-- ---- direct_messages ----
create policy "DMs: users can view their own DMs" on direct_messages
  for select to authenticated
  using (
    sender_id = get_my_member_id()
    or recipient_id = get_my_member_id()
  );

create policy "DMs: users can send DMs" on direct_messages
  for insert to authenticated
  with check (sender_id = get_my_member_id());

-- ---- surveys ----
create policy "Surveys: authenticated users can view" on surveys
  for select to authenticated using (true);

create policy "Surveys: committee/admin can create" on surveys
  for insert to authenticated
  with check (get_my_role() in ('committee', 'admin'));

-- ---- survey_responses ----
create policy "SurveyResponses: members see own; committee/admin see all" on survey_responses
  for select to authenticated
  using (
    member_id = get_my_member_id()
    or get_my_role() in ('committee', 'admin')
  );

create policy "SurveyResponses: members can respond once" on survey_responses
  for insert to authenticated
  with check (member_id = get_my_member_id());

-- ---- invitations ----
create policy "Invitations: member sees own; committee/admin see all" on invitations
  for select to authenticated
  using (
    member_id = get_my_member_id()
    or get_my_role() in ('committee', 'admin')
  );

create policy "Invitations: committee/admin can create" on invitations
  for insert to authenticated
  with check (get_my_role() in ('committee', 'admin'));

-- ============================================================
-- STORAGE BUCKETS + RLS
-- ============================================================
-- Create buckets first (Supabase dashboard or CLI):
--   supabase storage create photos --public false
--   supabase storage create profile-photos --public true
--
-- Then run these policies (storage.objects RLS):

-- photos bucket — private reunion photos
create policy "Storage photos: members can view"
  on storage.objects for select to authenticated
  using (bucket_id = 'photos');

create policy "Storage photos: members can upload"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'photos');

create policy "Storage photos: uploader or committee/admin can delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'photos'
    and (
      owner = auth.uid()
      or exists (
        select 1 from public.members
        where auth_user_id = auth.uid()
        and role in ('committee', 'admin')
      )
    )
  );

-- profile-photos bucket — public member avatars
create policy "Storage profile-photos: public can view"
  on storage.objects for select
  using (bucket_id = 'profile-photos');

create policy "Storage profile-photos: members can upload"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'profile-photos');

create policy "Storage profile-photos: uploader or committee/admin can delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'profile-photos'
    and (
      owner = auth.uid()
      or exists (
        select 1 from public.members
        where auth_user_id = auth.uid()
        and role in ('committee', 'admin')
      )
    )
  );

-- ============================================================
-- SEED: Create the first admin account
-- After setting up Auth, run this to promote the first user:
-- UPDATE members SET role = 'admin' WHERE email = 'your-email@example.com';
-- ============================================================
