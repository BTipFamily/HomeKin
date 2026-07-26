\set ON_ERROR_STOP on
\set T '''10000000-0000-0000-0000-000000000002'''
\set S '''10000000-0000-0000-0000-000000000003'''
\set B '''10000000-0000-0000-0000-000000000004'''

create or replace function assert(label text, ok boolean) returns void language plpgsql as $$
begin
  if ok then raise notice 'PASS  %', label;
  else raise exception 'FAIL  %', label; end if;
end $$;

do $$
declare m members%rowtype;
begin
  perform assert('source profile is gone',
    not exists (select 1 from members where id = '10000000-0000-0000-0000-000000000003'));

  select * into m from members where id = '10000000-0000-0000-0000-000000000002';

  perform assert('kept profile adopted the login',
    m.auth_user_id = '00000000-0000-0000-0000-0000000000a2');
  perform assert('kept profile keeps its own email', m.email = 'jane@example.com');
  perform assert('role promoted to the higher of the two', m.role = 'committee');
  perform assert('no longer flagged as an unclaimed profile', m.created_by_proxy = false);
  perform assert('kept profile phone wins', m.phone = '555-1111');
  perform assert('blank address filled from the merged profile', m.address = '9 Oak St');
  perform assert('blank bio filled from the merged profile', m.bio = 'Loves gardening.');
  perform assert('kept profile date_of_birth survives', m.date_of_birth = '1980-04-01');
  perform assert('kept profile social link wins', m.social_links ->> 'facebook' = 'fb/jane');
  perform assert('missing social link filled from merged profile',
    m.social_links ->> 'instagram' = 'ig/jane');
end $$;

do $$
begin
  -- Signups: collision on Picnic resolved, Banquet carried across
  perform assert('exactly two signups remain',
    (select count(*) from signups where member_id = '10000000-0000-0000-0000-000000000002') = 2);
  perform assert('confirmation carried over to the kept signup',
    (select status from signups
      where member_id = '10000000-0000-0000-0000-000000000002'
        and sub_event_id = '30000000-0000-0000-0000-000000000001') = 'confirmed');
  perform assert('kept signup headcount not double counted',
    (select headcount from signups
      where member_id = '10000000-0000-0000-0000-000000000002'
        and sub_event_id = '30000000-0000-0000-0000-000000000001') = 2);
  perform assert('non-colliding signup moved across',
    exists (select 1 from signups
      where member_id = '10000000-0000-0000-0000-000000000002'
        and sub_event_id = '30000000-0000-0000-0000-000000000002'));
  perform assert('no signups left pointing at the removed profile',
    not exists (select 1 from signups where member_id = '10000000-0000-0000-0000-000000000003'));
end $$;

do $$
begin
  perform assert('both balances now sit on the kept profile',
    (select count(*) from balances where member_id = '10000000-0000-0000-0000-000000000002') = 2);
  perform assert('balance amounts untouched',
    (select sum(amount_owed) from balances where member_id = '10000000-0000-0000-0000-000000000002') = 125);
end $$;

do $$
begin
  perform assert('self-edge between the two profiles removed',
    not exists (select 1 from relationships
      where member_id = related_member_id
         or (member_id = '10000000-0000-0000-0000-000000000002'
             and related_member_id = '10000000-0000-0000-0000-000000000002')));
  perform assert('duplicate parent edge collapsed to one',
    (select count(*) from relationships
      where member_id = '10000000-0000-0000-0000-000000000002'
        and related_member_id = '10000000-0000-0000-0000-000000000004'
        and relationship_type = 'parent_child') = 1);
  perform assert('distinct custom edge preserved',
    (select count(*) from relationships
      where member_id = '10000000-0000-0000-0000-000000000002'
        and related_member_id = '10000000-0000-0000-0000-000000000004'
        and relationship_type = 'custom') = 1);
  perform assert('inbound edge re-pointed at the kept profile',
    (select count(*) from relationships
      where member_id = '10000000-0000-0000-0000-000000000004'
        and related_member_id = '10000000-0000-0000-0000-000000000002'
        and relationship_type = 'parent_child') = 1);
  perform assert('three relationships total',
    (select count(*) from relationships) = 3);
  perform assert('relationship created_by re-pointed',
    not exists (select 1 from relationships where created_by = '10000000-0000-0000-0000-000000000003'));
end $$;

do $$
begin
  perform assert('kept profile answers win on the shared survey',
    (select answers ->> 'keep' from survey_responses
      where member_id = '10000000-0000-0000-0000-000000000002'
        and survey_id = '40000000-0000-0000-0000-000000000001') = 'target');
  perform assert('unique survey response carried across',
    exists (select 1 from survey_responses
      where member_id = '10000000-0000-0000-0000-000000000002'
        and survey_id = '40000000-0000-0000-0000-000000000002'));
  perform assert('two survey responses total',
    (select count(*) from survey_responses) = 2);
end $$;

do $$
begin
  perform assert('photo tag list deduped after retag',
    (select array_length(tagged_members, 1) from photos
      where id = '50000000-0000-0000-0000-000000000001') = 2);
  perform assert('kept profile still tagged on the shared photo',
    (select tagged_members from photos where id = '50000000-0000-0000-0000-000000000001')
      @> array['10000000-0000-0000-0000-000000000002']::uuid[]);
  perform assert('sole tag rewritten on the second photo',
    (select tagged_members from photos where id = '50000000-0000-0000-0000-000000000002')
      = array['10000000-0000-0000-0000-000000000002']::uuid[]);
  perform assert('no photo still tags the removed profile',
    not exists (select 1 from photos where '10000000-0000-0000-0000-000000000003'::uuid = any(tagged_members)));
  perform assert('photo uploader re-pointed',
    (select uploaded_by from photos where id = '50000000-0000-0000-0000-000000000001')
      = '10000000-0000-0000-0000-000000000002');
end $$;

do $$
begin
  perform assert('announcement author re-pointed',
    (select created_by from announcements limit 1) = '10000000-0000-0000-0000-000000000002');
  perform assert('message sender re-pointed',
    (select sender_id from messages limit 1) = '10000000-0000-0000-0000-000000000002');
  perform assert('invitation re-pointed',
    (select member_id from invitations limit 1) = '10000000-0000-0000-0000-000000000002');
  perform assert('invite code redemption re-pointed',
    (select used_by from invite_codes limit 1) = '10000000-0000-0000-0000-000000000002');
  perform assert('survey author re-pointed',
    (select created_by from surveys where id = '40000000-0000-0000-0000-000000000001')
      = '10000000-0000-0000-0000-000000000002');
  perform assert('timeline item author re-pointed',
    (select created_by from reunion_timeline_items limit 1) = '10000000-0000-0000-0000-000000000002');
end $$;

\echo ''
\echo '########## ALL ASSERTIONS PASSED ##########'
