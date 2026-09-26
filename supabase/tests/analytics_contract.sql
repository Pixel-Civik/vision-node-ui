-- Local regression database only. Transaction rolls back all synthetic fixtures.
begin;
insert into public.sites(id,name,slug) values (-9101,'fixture-A','fixture-a'),(-9102,'fixture-B','fixture-b');
insert into public.cameras(id,site_id,channel) values (-9101,-9101,'fixture-101'),(-9102,-9102,'fixture-701');
insert into public.event_types(id,code) values (-9101,'enter'),(-9102,'time_in_zone');
insert into public.events(site_id,camera_id,event_type_id,time,track_id,zone,gender,age) values
(-9101,-9101,-9101,'2026-09-21 09:00:00-05',1,'queue','female','adult'),
(-9101,-9101,-9101,'2026-09-21 20:00:00-05',2,'queue','male','adult'),
(-9101,-9101,-9101,'2026-09-22 09:00:00-05',3,'queue','male','adult'),
(-9102,-9102,-9101,'2026-09-21 09:00:00-05',4,'queue','male','adult'),
(-9101,-9101,-9101,'2026-09-21 09:00:00-05',5,'other','male','adult');
insert into public.events(site_id,camera_id,event_type_id,time,zone,dwell_sec)
select -9101,-9101,-9102,'2026-09-21 09:00:00-05'::timestamptz,'queue',60 from generate_series(1,6001);
insert into public.events(site_id,camera_id,event_type_id,time,zone,dwell_sec) values
(-9101,-9101,-9102,'2026-09-21 20:00:00-05','queue',900),
(-9102,-9102,-9102,'2026-09-21 09:00:00-05','queue',900),
(-9101,-9101,-9102,'2026-09-22 09:00:00-05','queue',900);
set local role anon;
do $$
declare gender_n bigint; age_n bigint; result jsonb; overview jsonb;
begin
  select sum(count) filter(where dimension='gender'),sum(count) filter(where dimension='age') into gender_n,age_n
  from public.dashboard_gender_age_filtered('2026-09-21 00:00-05','2026-09-22 23:59-05',array['fixture-A'],array['fixture-101'],array['queue'],9,10,array[0],array['enter']);
  if gender_n <> 1 or age_n <> 1 then raise exception 'demographics failed: %, %',gender_n,age_n; end if;
  result := public.dashboard_tiz_distribution('2026-09-21 00:00-05','2026-09-22 23:59-05',array['fixture-A'],array['fixture-101'],array['queue'],9,10,array[0]);
  if (result->>'count')::int <> 6001 or (result->>'median_s')::numeric <> 60 or (result->'buckets'->2->>'count')::int <> 6001 then raise exception 'distribution failed: %',result; end if;
  overview := public.dashboard_overview('2026-09-21 00:00-05','2026-09-22 23:59-05',array['fixture-A'],array['fixture-101'],array['queue'],9,10,array[0]);
  if (overview->'kpis'->>'enters')::int <> gender_n then raise exception 'overview demographics mismatch: %',overview; end if;
  result := public.dashboard_tiz_distribution('2026-09-21 00:00-05','2026-09-22 23:59-05',array['fixture-A'],null,null,0,23,array[]::int[]);
  if (result->>'count')::int <> 0 then raise exception 'empty day selection must match no events'; end if;
end $$;
rollback;
