-- Read-only schedule inspection. Job command text can contain credentials.
begin read only;
do $$
declare v_job record;
begin
  if to_regclass('cron.job') is null then
    raise notice 'pg_cron job catalog is absent in this database. Check external schedulers separately.';
    return;
  end if;
  if not has_table_privilege(current_user,'cron.job','SELECT') then
    raise exception 'The deployment role must be able to inspect pg_cron jobs.';
  end if;
  for v_job in execute $cron$
    select jobid,schedule,active,username,database from cron.job
    where command ~* '(admin_release_expired_reservations|expire_stale_stock_reservations|expire-reservations|release-expired-holds)'
    order by jobid
  $cron$ loop
    raise notice 'Reservation expiry job % schedule=% active=% role=% database=%',
      v_job.jobid,v_job.schedule,v_job.active,v_job.username,v_job.database;
  end loop;
end;
$$;
rollback;
