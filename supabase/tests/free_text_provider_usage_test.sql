begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public,extensions;
select plan(24);

select ok(
    has_function_privilege(role_name, signature, 'EXECUTE') = (role_name = 'service_role'),
    role_name || ' has expected execution access for ' || signature
)
from (values ('anon'), ('authenticated'), ('service_role')) as roles(role_name)
cross join (values
    ('record_visitor_execution(text,uuid,jsonb,jsonb,integer)'),
    ('complete_organize_job(uuid,uuid,integer,jsonb)')
) as functions(signature);

insert into auth.users(id,email)
values ('00000000-0000-4000-8000-000000235001','free-provider-owner@example.invalid');
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000235001';
select create_exhibition('00000000-0000-4000-8000-000000235002','Telemetry exhibition',null,null,null,
    '[{"id":"introduction","body":"Synthetic source"}]','[{"kind":"direct","section_id":"introduction"}]');
select set_config('test.provider_document',(select id::text from knowledge_documents
    where subject_type = 'exhibition' and exhibition_id = '00000000-0000-4000-8000-000000235002'),true);
reset role;

-- Seed a terminal visitor request to exercise only the execution record RPC.
insert into api_requests(id,session_hash,request_id,exhibition_id,kind,state,failure_code)
values ('00000000-0000-4000-8000-000000235003',decode(repeat('a',64),'hex'),
    '00000000-0000-4000-8000-000000235004','00000000-0000-4000-8000-000000235002',
    'question','failed','EVIDENCE_REQUIRED');

select set_config('test.provider_usage', '[
    {"provider":"gemini","model":"fixture-gemini","mock":false,"usage":{"inputTokens":20,"outputTokens":3,"totalTokens":23}},
    {"provider":"groq","model":"fixture/groq","mock":false,"usage":{"inputTokens":30,"outputTokens":5,"totalTokens":35}},
    {"provider":"liner","model":"fixture-liner"},
    {"provider":"openai","model":"fixture-openai"},
    {"provider":"typecast","model":"fixture-typecast"},
    {"provider":"exaone","model":"fixture-exaone"},
    {"provider":"mock","model":"fixture-mock"}
]', true);
select set_config('test.invalid_provider_usage', '{
    "unknown provider": [{"provider":"other","model":"fixture-other"}],
    "question field": [{"provider":"gemini","model":"fixture-gemini","question":"synthetic private text"}],
    "unknown token field": [{"provider":"groq","model":"fixture/groq","usage":{"rawTokens":1}}],
    "negative token count": [{"provider":"gemini","model":"fixture-gemini","usage":{"inputTokens":-1}}],
    "token count beyond the safe integer bound": [{"provider":"groq","model":"fixture/groq","usage":{"totalTokens":9007199254740992}}]
}', true);

set local role service_role;
select set_config('test.provider_job',reserve_organize_job('00000000-0000-4000-8000-000000235001',
    '00000000-0000-4000-8000-000000235005',current_setting('test.provider_document')::uuid,1,false)#>>'{job,id}',true);
select set_config('test.provider_result',jsonb_build_object(
    'proposal',null,'resultCode','EVIDENCE_REQUIRED','routing','author',
    'usage',current_setting('test.provider_usage')::jsonb,'steps','[]'::jsonb,'elapsedMs',10,'mock',false
)::text,true);

select throws_ok(format($sql$
    select record_visitor_execution(repeat('a',64),'00000000-0000-4000-8000-000000235003','[]',%L,10)
$sql$, usage), '22023','Invalid visitor execution metadata','visitor telemetry rejects ' || description)
from jsonb_each(current_setting('test.invalid_provider_usage')::jsonb) as cases(description,usage);
select throws_ok(format($sql$
    select complete_organize_job('00000000-0000-4000-8000-000000235001',current_setting('test.provider_job')::uuid,1,
        jsonb_set(current_setting('test.provider_result')::jsonb,'{usage}',%L))
$sql$, usage), '22023','Invalid organization usage','organize telemetry rejects ' || description)
from jsonb_each(current_setting('test.invalid_provider_usage')::jsonb) as cases(description,usage);

select lives_ok($$select record_visitor_execution(repeat('a',64),'00000000-0000-4000-8000-000000235003','[]',
    current_setting('test.provider_usage')::jsonb,10)$$,'visitor telemetry accepts Gemini, Groq and existing providers');
select lives_ok($$select record_visitor_execution(repeat('a',64),'00000000-0000-4000-8000-000000235003','[]',
    current_setting('test.provider_usage')::jsonb,10)$$,'identical visitor telemetry can replay');
select throws_ok($$select record_visitor_execution(repeat('a',64),'00000000-0000-4000-8000-000000235003','[]',
    current_setting('test.provider_usage')::jsonb,11)$$,'P1011','Visitor execution already recorded',
    'changed visitor telemetry replay is rejected');
select is(complete_organize_job('00000000-0000-4000-8000-000000235001',current_setting('test.provider_job')::uuid,1,
    current_setting('test.provider_result')::jsonb)->>'status','abstained',
    'organize telemetry accepts Gemini, Groq and existing providers');
select is(complete_organize_job('00000000-0000-4000-8000-000000235001',current_setting('test.provider_job')::uuid,1,
    current_setting('test.provider_result')::jsonb)->>'status','abstained','identical organize telemetry can replay');
select throws_ok($$select complete_organize_job('00000000-0000-4000-8000-000000235001',current_setting('test.provider_job')::uuid,1,
    jsonb_set(current_setting('test.provider_result')::jsonb,'{elapsedMs}','11'))$$,
    'P1006','Job attempt completed with different result','changed organize telemetry replay is rejected');

reset role;
select is((select usage from api_requests where id = '00000000-0000-4000-8000-000000235003'),
    jsonb_build_object('calls',current_setting('test.provider_usage')::jsonb,'elapsedMs',10),
    'visitor request stores the exact accepted usage');
select is((select usage from ai_job_attempts where job_id = current_setting('test.provider_job')::uuid and attempt = 1),
    current_setting('test.provider_usage')::jsonb,'organize attempt stores the exact accepted usage');
select * from finish();
rollback;
