\set ON_ERROR_STOP on

create or replace function assert(label text, ok boolean) returns void language plpgsql as $$
begin
  if ok then raise notice 'PASS  %', label;
  else raise exception 'FAIL  %', label; end if;
end $$;

delete from members;
delete from auth.users;
delete from reunions;

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000f1', 'admin@x.com');
insert into members (id, auth_user_id, name, email, role) values
  ('17000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f1', 'Admin', 'admin@x.com', 'admin'),
  ('17000000-0000-0000-0000-000000000002', null, 'Payer', 'payer@x.com', 'member');

insert into reunions (id, name, year) values ('27000000-0000-0000-0000-000000000001', 'R', 2026);
insert into sub_events (id, reunion_id, name, date, cost_per_person) values
  ('37000000-0000-0000-0000-000000000001', '27000000-0000-0000-0000-000000000001', 'Banquet', '2026-08-01', 100),
  ('37000000-0000-0000-0000-000000000002', '27000000-0000-0000-0000-000000000001', 'Picnic', '2026-08-02', 25);

-- ---- the shape of a checkpoint ----

insert into event_deadlines (id, sub_event_id, label, due_date, amount_type, amount_value, sort_order) values
  ('47000000-0000-0000-0000-000000000001', '37000000-0000-0000-0000-000000000001',
   'Deposit', '2026-03-01', 'percent', 25, 0),
  ('47000000-0000-0000-0000-000000000002', '37000000-0000-0000-0000-000000000001',
   'Second payment', '2026-05-01', 'fixed_per_person', 30, 1);

insert into event_deadlines (id, sub_event_id, label, due_date, amount_type, amount_value, sort_order) values
  ('47000000-0000-0000-0000-000000000003', '37000000-0000-0000-0000-000000000001',
   'Final balance', '2026-07-01', 'remainder', null, 2);

do $$
begin
  perform assert('a deadline defaults to a fortnight and a final nudge',
    (select reminder_offsets from event_deadlines
      where id = '47000000-0000-0000-0000-000000000001') = '{14,3}');
end $$;

-- ---- amount_value and amount_type cannot drift apart ----

do $$
begin
  begin
    insert into event_deadlines (sub_event_id, label, due_date, amount_type, amount_value)
      values ('37000000-0000-0000-0000-000000000002', 'Bad', '2026-04-01', 'remainder', 50);
    perform assert('a remainder cannot carry an amount', false);
  exception when check_violation then
    perform assert('a remainder cannot carry an amount', true);
  end;

  begin
    insert into event_deadlines (sub_event_id, label, due_date, amount_type, amount_value)
      values ('37000000-0000-0000-0000-000000000002', 'Bad', '2026-04-01', 'percent', null);
    perform assert('a percent checkpoint must carry an amount', false);
  exception when check_violation then
    perform assert('a percent checkpoint must carry an amount', true);
  end;

  begin
    insert into event_deadlines (sub_event_id, label, due_date, amount_type, amount_value)
      values ('37000000-0000-0000-0000-000000000002', 'Bad', '2026-04-01', 'percent', 150);
    perform assert('a percentage over 100 is rejected', false);
  exception when check_violation then
    perform assert('a percentage over 100 is rejected', true);
  end;

  begin
    insert into event_deadlines (sub_event_id, label, due_date, amount_type, amount_value)
      values ('37000000-0000-0000-0000-000000000002', 'Bad', '2026-04-01', 'fixed_per_person', 0);
    perform assert('a zero fixed amount is rejected', false);
  exception when check_violation then
    perform assert('a zero fixed amount is rejected', true);
  end;

  begin
    insert into event_deadlines (sub_event_id, label, due_date, amount_type, amount_value, reminder_offsets)
      values ('37000000-0000-0000-0000-000000000002', 'Bad', '2026-04-01', 'percent', 10, '{-3}');
    perform assert('a negative reminder offset is rejected', false);
  exception when check_violation then
    perform assert('a negative reminder offset is rejected', true);
  end;

  begin
    insert into event_deadlines (sub_event_id, label, due_date, amount_type, amount_value)
      values ('37000000-0000-0000-0000-000000000002', '   ', '2026-04-01', 'percent', 10);
    perform assert('a blank label is rejected', false);
  exception when check_violation then
    perform assert('a blank label is rejected', true);
  end;
end $$;

-- ---- one checkpoint per date, one remainder per event ----

do $$
begin
  begin
    insert into event_deadlines (sub_event_id, label, due_date, amount_type, amount_value)
      values ('37000000-0000-0000-0000-000000000001', 'Clash', '2026-03-01', 'percent', 10);
    perform assert('two checkpoints cannot share a date', false);
  exception when unique_violation then
    perform assert('two checkpoints cannot share a date', true);
  end;

  begin
    insert into event_deadlines (sub_event_id, label, due_date, amount_type, amount_value)
      values ('37000000-0000-0000-0000-000000000001', 'Another remainder', '2026-06-01', 'remainder', null);
    perform assert('an event can only have one remainder', false);
  exception when unique_violation then
    perform assert('an event can only have one remainder', true);
  end;

  -- The same date on a different event is fine.
  insert into event_deadlines (sub_event_id, label, due_date, amount_type, amount_value)
    values ('37000000-0000-0000-0000-000000000002', 'Deposit', '2026-03-01', 'percent', 50);
  perform assert('a different event may reuse a date',
    (select count(*) from event_deadlines where due_date = '2026-03-01') = 2);
end $$;

-- ---- deadlines follow their event to the grave ----

do $$
declare v_before integer;
begin
  select count(*) into v_before from event_deadlines
    where sub_event_id = '37000000-0000-0000-0000-000000000002';
  perform assert('the picnic has a checkpoint before the event is deleted', v_before = 1);

  delete from sub_events where id = '37000000-0000-0000-0000-000000000002';

  perform assert('deleting an event deletes its checkpoints',
    (select count(*) from event_deadlines
      where sub_event_id = '37000000-0000-0000-0000-000000000002') = 0);
  perform assert('the other event keeps its checkpoints',
    (select count(*) from event_deadlines
      where sub_event_id = '37000000-0000-0000-0000-000000000001') = 3);
end $$;

-- ============================================================
-- email_sends: the promise not to email people twice
-- ============================================================

insert into balances (id, member_id, reunion_id, sub_event_id, amount_owed, amount_paid) values
  ('57000000-0000-0000-0000-000000000001', '17000000-0000-0000-0000-000000000002',
   '27000000-0000-0000-0000-000000000001', '37000000-0000-0000-0000-000000000001', 200, 0);

do $$
begin
  insert into email_sends (kind, member_id, reunion_id, deadline_id, offset_days) values
    ('deadline_reminder', '17000000-0000-0000-0000-000000000002',
     '27000000-0000-0000-0000-000000000001', '47000000-0000-0000-0000-000000000001', 14);

  begin
    insert into email_sends (kind, member_id, reunion_id, deadline_id, offset_days) values
      ('deadline_reminder', '17000000-0000-0000-0000-000000000002',
       '27000000-0000-0000-0000-000000000001', '47000000-0000-0000-0000-000000000001', 14);
    perform assert('a reminder cannot be sent twice', false);
  exception when unique_violation then
    perform assert('a reminder cannot be sent twice', true);
  end;

  -- The 3-day nudge is a different send, not a duplicate of the 14-day one.
  insert into email_sends (kind, member_id, reunion_id, deadline_id, offset_days) values
    ('deadline_reminder', '17000000-0000-0000-0000-000000000002',
     '27000000-0000-0000-0000-000000000001', '47000000-0000-0000-0000-000000000001', 3);
  perform assert('a later reminder in the same series still sends',
    (select count(*) from email_sends where kind = 'deadline_reminder') = 2);
end $$;

do $$
begin
  begin
    insert into email_sends (kind, member_id, reunion_id) values
      ('deadline_reminder', '17000000-0000-0000-0000-000000000002',
       '27000000-0000-0000-0000-000000000001');
    perform assert('a reminder must say which checkpoint it is for', false);
  exception when check_violation then
    perform assert('a reminder must say which checkpoint it is for', true);
  end;

  begin
    insert into email_sends (kind, member_id, reunion_id) values
      ('payment_receipt', '17000000-0000-0000-0000-000000000002',
       '27000000-0000-0000-0000-000000000001');
    perform assert('a receipt must say which payment it is for', false);
  exception when check_violation then
    perform assert('a receipt must say which payment it is for', true);
  end;
end $$;

-- ---- receipts are once per payment ----

insert into payments (id, balance_id, member_id, reunion_id, amount, method) values
  ('67000000-0000-0000-0000-000000000001', '57000000-0000-0000-0000-000000000001',
   '17000000-0000-0000-0000-000000000002', '27000000-0000-0000-0000-000000000001', 50, 'stripe');

do $$
begin
  insert into email_sends (kind, member_id, reunion_id, payment_id) values
    ('payment_receipt', '17000000-0000-0000-0000-000000000002',
     '27000000-0000-0000-0000-000000000001', '67000000-0000-0000-0000-000000000001');

  begin
    insert into email_sends (kind, member_id, reunion_id, payment_id) values
      ('payment_receipt', '17000000-0000-0000-0000-000000000002',
       '27000000-0000-0000-0000-000000000001', '67000000-0000-0000-0000-000000000001');
    perform assert('a receipt cannot be sent twice for one payment', false);
  exception when unique_violation then
    perform assert('a receipt cannot be sent twice for one payment', true);
  end;
end $$;

-- ---- statements are deliberately not deduped ----

do $$
begin
  insert into email_sends (kind, member_id, reunion_id) values
    ('statement', '17000000-0000-0000-0000-000000000002', '27000000-0000-0000-0000-000000000001'),
    ('statement', '17000000-0000-0000-0000-000000000002', '27000000-0000-0000-0000-000000000001');

  perform assert('a member can be sent a fresh statement every time they change something',
    (select count(*) from email_sends where kind = 'statement') = 2);
end $$;

-- ---- the log follows its deadline and its member ----

do $$
begin
  delete from event_deadlines where id = '47000000-0000-0000-0000-000000000001';
  perform assert('deleting a checkpoint clears its reminder log',
    (select count(*) from email_sends where kind = 'deadline_reminder') = 0);

  delete from members where id = '17000000-0000-0000-0000-000000000002';
  perform assert('deleting a member clears their email log',
    (select count(*) from email_sends) = 0);
end $$;
