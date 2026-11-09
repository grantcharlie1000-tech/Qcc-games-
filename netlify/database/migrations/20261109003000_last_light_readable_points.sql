-- Preserve earned chapters from the original million-point sort keys. Spark and
-- pace bonuses cannot be recovered independently from the old combined tie-break.
UPDATE arcade_scores SET score=(score/1000000)*1000
 WHERE game_id='last-light' AND score BETWEEN 1000000 AND 40999999;
UPDATE account_saves SET value=to_jsonb((value::text::bigint/1000000)*1000),
 updated=greatest(updated+1,(extract(epoch FROM now())*1000)::bigint)
 WHERE key='best:last-light' AND jsonb_typeof(value)='number'
 AND value::text::numeric BETWEEN 1000000 AND 40999999;
