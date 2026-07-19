-- ============================================================
-- Family relationships (full genealogy detail)
-- ============================================================

-- Internal-only: required by the relatives-tree layout library used on the
-- /family-tree page for spouse left/right ordering. Not exposed as a
-- profile field; members with it unset get a deterministic layout fallback.
alter table members
  add column if not exists gender text check (gender in ('male', 'female'));

create table relationships (
  id uuid primary key default uuid_generate_v4(),
  member_id uuid not null references members(id) on delete cascade,
  related_member_id uuid not null references members(id) on delete cascade,
  relationship_type text not null check (relationship_type in ('parent_child', 'partner', 'custom')),

  -- parent_child edges are directional: member_id = parent, related_member_id = child
  parent_child_kind text check (parent_child_kind in ('biological', 'step', 'adoptive', 'foster')),

  -- partner edges (stored as a single directed row; queried with an OR on both columns)
  partner_status text check (partner_status in ('married', 'divorced', 'separated', 'partnered', 'widowed', 'engaged')),
  partner_start_date date,
  partner_end_date date,

  -- escape hatch for anything that doesn't fit the two structured kinds
  -- (e.g. "guardian", "godparent") — free text, no inference performed on it
  custom_label text,

  created_by uuid references members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint relationships_not_self check (member_id <> related_member_id),
  constraint relationships_kind_matches_type check (
    (relationship_type = 'parent_child' and parent_child_kind is not null
       and partner_status is null and custom_label is null)
    or (relationship_type = 'partner' and partner_status is not null
       and parent_child_kind is null and custom_label is null)
    or (relationship_type = 'custom' and custom_label is not null
       and parent_child_kind is null and partner_status is null)
  ),
  unique (member_id, related_member_id, relationship_type)
);

create index relationships_member_id_idx on relationships (member_id);
create index relationships_related_member_id_idx on relationships (related_member_id);

create trigger relationships_updated_at
  before update on relationships
  for each row execute function handle_updated_at();

alter table relationships enable row level security;

-- ---- relationships ----
create policy "Relationships: authenticated users can view" on relationships
  for select to authenticated using (true);

create policy "Relationships: party or committee/admin can insert" on relationships
  for insert to authenticated
  with check (
    member_id = get_my_member_id()
    or related_member_id = get_my_member_id()
    or get_my_role() in ('committee', 'admin')
  );

create policy "Relationships: party or committee/admin can update" on relationships
  for update to authenticated
  using (
    member_id = get_my_member_id()
    or related_member_id = get_my_member_id()
    or get_my_role() in ('committee', 'admin')
  );

create policy "Relationships: party or committee/admin can delete" on relationships
  for delete to authenticated
  using (
    member_id = get_my_member_id()
    or related_member_id = get_my_member_id()
    or get_my_role() in ('committee', 'admin')
  );
