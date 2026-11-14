begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();

select is(yeoback_private.exhibition_period_state(
    jsonb_populate_record(null::public.exhibitions,'{"start_date":"2026-11-14","end_date":"2026-11-14","start_time":"10:00","end_time":"18:00"}'),
    sample.at::timestamptz),sample.expected,sample.label)
from (values
    ('2026-11-14T00:59:59Z','upcoming','before the Seoul opening time'),
    ('2026-11-14T01:00:00Z','ongoing','exact opening is within the period'),
    ('2026-11-14T09:00:00Z','ongoing','exact closing is still within the inclusive period'),
    ('2026-11-14T09:00:00.000001Z','ended','after closing is ended')
) sample(at,expected,label);

select is(yeoback_private.exhibition_period_state(
    jsonb_populate_record(null::public.exhibitions,'{"start_date":"2026-11-14","end_date":"2026-11-14"}'),
    sample.at::timestamptz),sample.expected,sample.label)
from (values
    ('2026-11-13T14:59:59Z','upcoming','legacy date starts at Seoul midnight'),
    ('2026-11-13T15:00:00Z','ongoing','legacy opening day includes midnight'),
    ('2026-11-14T14:59:59.999999Z','ongoing','legacy closing day includes its last microsecond'),
    ('2026-11-14T15:00:00Z','ended','legacy period ends at the next Seoul day')
) sample(at,expected,label);

select is(yeoback_private.exhibition_period_state(
    jsonb_populate_record(null::public.exhibitions,fields::jsonb),'2026-11-14T01:00:00Z'),'unknown',label)
from (values
    ('{}','missing period is unknown'),
    ('{"start_date":"2026-11-15","end_date":"2026-11-14"}','reversed draft is unknown')
) sample(fields,label);

select is(yeoback_private.exhibition_dashboard_status(state,period),expected,label)
from (values
    ('draft','ended','preparing','unpublished takes precedence over an expired period'),
    ('paused','ended','preparing','paused exhibition is also unpublished'),
    ('published','upcoming','preparing','published future exhibition is preparing'),
    ('published','unknown','preparing','unknown period is not asserted to be ongoing'),
    ('published','ongoing','ongoing','published current exhibition is ongoing'),
    ('published','ended','ended','published past exhibition is ended')
) sample(state,period,expected,label);

select is(yeoback_private.exhibition_period_state(
    jsonb_populate_record(null::public.exhibitions,fields::jsonb),'2026-11-14T01:00:00Z'),expected,label)
from (values
    ('{"start_date":"5000000-01-01","end_date":"5000000-01-02"}','upcoming','legacy dates beyond timestamp range remain readable'),
    ('{"start_date":"2020-01-01","end_date":"5000000-01-02"}','ongoing','an extreme future end does not overflow')
) sample(fields,expected,label);

insert into auth.users(id,email) values('00000000-0000-4000-8000-000000171001','history@example.invalid');
set local role authenticated;
set local request.jwt.claim.sub='00000000-0000-4000-8000-000000171001';
select update_knowledge_document('artist',(get_artist_profile()->>'id')::uuid,1,
    '[{"id":"artist_education","body":"학력"},{"id":"artist_exhibitions","body":"전시"},
      {"id":"artist_awards","body":"수상"},{"id":"artist_activities","body":"활동"},
      {"id":"artist_other_history","body":"기타"}]','[]');
select is(get_artist_profile()->>'art_world_registered','false','history alone does not register an art world');
select is(jsonb_array_length(get_artist_profile()#>'{document,sections}'),5,'all five optional history sections persist');
select throws_ok($$select create_exhibition_draft('00000000-0000-4000-8000-000000171002',null,null,null,null,null,null,
    '[{"id":"artist_education","body":"Wrong scope"}]','[]')$$,'22023','Invalid or duplicate knowledge section',
    'artist history is rejected in an exhibition document');
select update_knowledge_document('artist',(get_artist_profile()->>'id')::uuid,2,
    '[{"id":"practice","body":"기존 작품 세계"},{"id":"artist_education","body":"학력"}]','[]');
select is(get_artist_profile()->>'art_world_registered','true','legacy practice still registers an art world');
select * from finish();
rollback;
