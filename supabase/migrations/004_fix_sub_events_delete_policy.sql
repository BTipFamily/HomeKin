-- Missing DELETE policy on sub_events (INSERT/UPDATE existed, DELETE did not)
create policy "SubEvents: committee/admin can delete" on sub_events
  for delete using (get_my_role() in ('committee', 'admin'));
