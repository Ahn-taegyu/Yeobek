begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public,extensions;
select no_plan();

delete from public.automation_notify_signals;
update public.automation_events set state = 'suppressed',lease_until = null
    where kind = 'notify' and state in ('queued','running');
update public.automation_policies set mode = 'draft' where kind = 'notify';

insert into auth.users(id,email) values ('00000000-0000-0000-0000-000000000001','notify@example.invalid');
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select create_exhibition('10000000-0000-0000-0000-000000000001','Private title',null,null,null,
    '[{"id":"introduction","body":"Private draft text"}]','[]');
select create_artwork('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',
    1,'Unpublished work',null,null,null,'[{"id":"description","body":"Private source"}]','[]');
select ok(not has_function_privilege('authenticated','schedule_automation_notifications(integer,boolean)','EXECUTE'),
    'artists cannot schedule automation signals directly');
select ok(not has_function_privilege('authenticated','get_notification_context(uuid,integer,boolean)','EXECUTE'),
    'artists cannot fetch automation context directly');
set local role service_role;
select is(schedule_automation_notifications(1,true), '{"scheduled":1,"discarded":0}'::jsonb,
    'bounded scheduler consumes one created exhibition signal');
select is(schedule_automation_notifications(10,false), '{"scheduled":0,"discarded":0}'::jsonb,
    'same signal cannot be consumed again in live mode');
select ok(not has_table_privilege('service_role','automation_notify_signals','SELECT'),'worker reads signal only through RPC');
select ok(not has_function_privilege('authenticated','claim_automation_notifications(integer,boolean)','EXECUTE'),
    'artist cannot claim notification work');
select set_config('test.unrelated',enqueue_automation_event('briefing','daily_briefing','briefing:notify-isolation',
    null,null,null,true)->>'id',true);
select set_config('test.notify',(claim_automation_notifications(10,true)->0)::text,true);
select is(get_notification_context((current_setting('test.notify')::jsonb->>'id')::uuid,1,true),
    jsonb_build_object('eventId',current_setting('test.notify')::jsonb->>'id','trigger','exhibition_created','sourceRevision',1,
        'exhibitionId','10000000-0000-0000-0000-000000000001','exhibitionRevision',1,'exhibitionState','draft',
        'artworkCount',1,'approvedCount',0,'publishedCount',0),
    'context contains counts and status without titles, email, or source text');
select is(get_notification_context((current_setting('test.notify')::jsonb->>'id')::uuid,1,false),null,
    'wrong execution mode cannot read a notification context');

select set_config('test.job',reserve_ai_job('00000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',1,1,'single',true)#>>'{job,id}',true);
set local role authenticated;
select set_config('test.source',get_narration_context('20000000-0000-0000-0000-000000000001')#>>'{sources,0,id}',true);
set local role service_role;
select complete_ai_job('00000000-0000-0000-0000-000000000001',current_setting('test.job')::uuid,1,
    jsonb_build_object('status','selected','reason','passed','selected',jsonb_build_object(
        'answer','Draft reads private input','citations',jsonb_build_array(current_setting('test.source')))));
select is(schedule_automation_notifications(10,false), '{"scheduled":0,"discarded":0}'::jsonb,
    'live scheduler skips mock source job signals');
select is(schedule_automation_notifications(10,true), '{"scheduled":1,"discarded":0}'::jsonb,
    'mock scheduler consumes the mock source job signal');
select set_config('test.draft',(claim_automation_notifications(10,true)->0)::text,true);
select is(get_notification_context((current_setting('test.draft')::jsonb->>'id')::uuid,1,true)->>'trigger','draft_ready',
    'successful narration creates draft-ready signal');
reset role;
update artworks set revision = revision + 1 where id = '20000000-0000-0000-0000-000000000001';
set local role service_role;
select is(get_notification_context((current_setting('test.draft')::jsonb->>'id')::uuid,1,true),null,
    'changed artwork revision invalidates draft notification');

reset role;
insert into publications(id,owner_id,exhibition_id,artwork_id,version,number,title,image_key,evidence,
    narration_text,narration_hash,narration_citations,approved_by)
values ('40000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',1,1,'Public work','fixture/image',
    jsonb_build_object('schemaVersion',1,'items',jsonb_build_array(jsonb_build_object(
        'id','50000000-0000-0000-0000-000000000001','version',1,
        'ownerId','00000000-0000-0000-0000-000000000001','exhibitionId','10000000-0000-0000-0000-000000000001',
        'publicationId','40000000-0000-0000-0000-000000000001','artworkId','20000000-0000-0000-0000-000000000001',
        'scope','artwork','sourceLabel','Approved source','body','Approved narration',
        'contentHash',encode(sha256('Approved narration'::bytea),'hex')))),
    'Approved narration',sha256('Approved narration'::bytea),'[{"id":"50000000-0000-0000-0000-000000000001","version":1}]',
    '00000000-0000-0000-0000-000000000001');
update artworks set state = 'published',active_publication_id = '40000000-0000-0000-0000-000000000001'
    where id = '20000000-0000-0000-0000-000000000001';
update exhibitions set state = 'published',public_title = 'Public title',public_artist_display_name = 'Public artist',revision = 2
    where id = '10000000-0000-0000-0000-000000000001';
set local role service_role;
select is(schedule_automation_notifications(10,true), '{"scheduled":1,"discarded":0}'::jsonb,'publication queues one signal');
select set_config('test.published',(claim_automation_notifications(10,true)->0)::text,true);
select is(get_notification_context((current_setting('test.published')::jsonb->>'id')::uuid,1,true)->>'publishedCount','1',
    'publication context counts current public works');
reset role;
update exhibitions set state = 'paused',revision = 3 where id = '10000000-0000-0000-0000-000000000001';
set local role service_role;
select is(get_notification_context((current_setting('test.published')::jsonb->>'id')::uuid,1,true),null,
    'paused exhibition cannot send a publication notification');

reset role;
select is((select state from automation_events where id = current_setting('test.unrelated')::uuid),'queued',
    'notify runner never leases another automation kind');
update automation_events set expires_at = statement_timestamp() - interval '1 second' where id = current_setting('test.unrelated')::uuid;
update automation_events set expires_at = statement_timestamp() - interval '1 second'
    where id = (current_setting('test.published')::jsonb->>'id')::uuid;
update automation_notify_signals set expires_at = statement_timestamp() - interval '1 second'
    where trigger_kind = 'published';
set local role service_role;
select is(claim_automation_notifications(10,true),'[]'::jsonb,'notify expiry drain does not return more work');
select is(schedule_automation_notifications(1,true), '{"scheduled":0,"discarded":0}'::jsonb,
    'retention cleanup does not enqueue an expired signal');
reset role;
select is((select state from automation_events where id = current_setting('test.unrelated')::uuid),'queued',
    'notify expiry drain does not touch other automation kinds');
select is((select result_code from automation_events where id = (current_setting('test.published')::jsonb->>'id')::uuid),
    'EVENT_EXPIRED','notify expiry drain closes an expired claim');
select ok(not exists (select 1 from automation_notify_signals where trigger_kind = 'published'),
    'retention cleanup removes expired source signal');

reset role;
select * from finish();
rollback;
