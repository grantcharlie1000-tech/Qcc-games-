# QCC Social moderation runbook

Operators run these in SQL against the production database. Record every action in `social_moderation_actions` with your name and a note. A post reported by 3 distinct accounts is hidden automatically until resolved.

## Safeguarding

Urgent self-harm or child-safety reports go to the school's safeguarding lead, per school policy, straight away. Do not wait for a SQL review. Services in New Zealand (verify before release): 111 (emergency), 1737 (need to talk, call or text), Youthline 0800 376 633.

## List open reports by target

```sql
SELECT target_kind,target_id,count(*) AS reports,count(DISTINCT reporter_id) AS reporters,
       min(created_at) AS first_report,array_agg(DISTINCT category) AS categories
FROM social_reports WHERE resolved_at IS NULL
GROUP BY target_kind,target_id ORDER BY reporters DESC,first_report;
```

## Read a snapshot

```sql
SELECT id,reporter_id,category,note,snapshot,created_at
FROM social_reports WHERE target_kind='post' AND target_id='<id>' AND resolved_at IS NULL;
```

Messages are only available as the reporter's snapshot (`snapshot`). Chat content is not otherwise readable here.

## Hide or restore a post

```sql
UPDATE social_posts SET hidden=true WHERE id='<post id>';   -- restore: hidden=false
INSERT INTO social_moderation_actions (target_kind,target_id,action,note,moderator)
VALUES ('post','<post id>','hide','<why>','<your name>');   -- or 'restore'
```

## Delete a post

Prefer hiding (above): it needs no blob work and can be reversed. The author's own Delete in the app removes the media and blobs automatically. Use this runbook only when a post must be removed by an operator.

Run it in one transaction. Deleting the `media_objects` rows also removes the matching `social_post_media` rows (cascade). A post with replies stays as a tombstone.

```sql
BEGIN;
-- Capture the ids first: you need them to delete the stored blobs.
SELECT media_id FROM social_post_media WHERE post_id='<post id>';
DELETE FROM media_objects WHERE id IN (SELECT media_id FROM social_post_media WHERE post_id='<post id>');
DELETE FROM social_likes WHERE post_id='<post id>';
UPDATE social_posts SET deleted=true,body='',hidden=false WHERE id='<post id>';
INSERT INTO social_moderation_actions (target_kind,target_id,action,note,moderator)
VALUES ('post','<post id>','delete','<why>','<your name>');
COMMIT;
```

The database rows are not the stored files. The blobs `<id>/full` and `<id>/thumb` for each captured media id are never purged automatically and must be deleted from the media store by id. A developer runs, for each id:

```sh
node --input-type=module -e "const {netlifyMediaStore}=await import('./netlify/lib/media-store.mts');const s=await netlifyMediaStore();for(const v of ['full','thumb'])await s.delete('<media id>/'+v)"
```

This needs Netlify credentials for the site (for example via `netlify dev` or `netlify env`). Until the blobs are deleted they stay in storage, though they are no longer served.

## Dismiss reports

```sql
UPDATE social_reports SET resolved_at=now()
WHERE target_kind='post' AND target_id='<id>' AND resolved_at IS NULL;
INSERT INTO social_moderation_actions (target_kind,target_id,action,note,moderator)
VALUES ('post','<id>','dismiss','<why>','<your name>');
```

Resolving reports after hiding or deleting uses the same `UPDATE`, with the matching action recorded.

## Review history

```sql
SELECT created_at,moderator,action,target_kind,target_id,note
FROM social_moderation_actions ORDER BY created_at DESC LIMIT 50;
```
