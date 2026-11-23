do $migration$
declare
    matched integer;
begin
    update auth.users
    set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"gpir_admin_reader":true}'::jsonb
    where lower(email) = 'testxyz@fintechoisis.com'
      and email_confirmed_at is not null;
    get diagnostics matched = row_count;
    if matched <> 1 then
        raise exception 'Expected exactly one confirmed GPIR admin reader';
    end if;
end;
$migration$;
