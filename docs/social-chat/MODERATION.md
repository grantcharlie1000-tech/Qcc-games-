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

## Read a message report

Message reports carry the reporter's snapshot, which holds only the reported message's own text (`[photo]` for a snap), with no surrounding messages. The message itself may have expired already, and chat content is not otherwise readable here, so the snapshot is the only copy.

```sql
SELECT id,reporter_id,target_account_id,category,note,snapshot,created_at
FROM social_reports WHERE target_kind='message' AND target_id='<id>' AND resolved_at IS NULL;
```

Read it, then decide with the safeguarding lead if the content is serious (see Safeguarding). Record the outcome (see Dismiss reports, using `target_kind='message'`; for a message report that needs action, record `delete` or `dismiss` with a note describing what you did, for example that the account was reported to the school). Then resolve the reports.

## Read a post report

```sql
SELECT id,reporter_id,category,note,created_at
FROM social_reports WHERE target_kind='post' AND target_id='<id>' AND resolved_at IS NULL;
```

## Review an account report

For `target_kind='account'`, `target_id` is the account id. Look at that account's recent posts and its profile, hide anything that breaks the rules, and record an action:

```sql
SELECT p.id,p.created_at,p.hidden,p.deleted,left(p.body,120) AS body
FROM social_posts p WHERE p.author_id='<account id>' ORDER BY p.created_at DESC LIMIT 20;
SELECT display_name,bio,avatar_id,banner_id FROM social_profiles WHERE account_id='<account id>';

UPDATE social_posts SET hidden=true WHERE id='<post id>';    -- per post to hide
INSERT INTO social_moderation_actions (target_kind,target_id,action,note,moderator)
VALUES ('account','<account id>','hide','<what you hid and why>','<your name>');   -- or 'dismiss'
```

Then resolve the account's reports (Dismiss reports, with `target_kind='account'`).

## Clear a reported bio or display name

```sql
UPDATE social_profiles SET bio='' WHERE account_id='<account id>';           -- and/or display_name=''
INSERT INTO social_moderation_actions (target_kind,target_id,action,note,moderator)
VALUES ('account','<account id>','delete','cleared bio/display name','<your name>');
```

## Remove a reported avatar or banner

Avatars and banners are served publicly by id, so remove the reference first, then the blobs, then the row:

```sql
SELECT avatar_id,banner_id FROM social_profiles WHERE account_id='<account id>';
UPDATE social_profiles SET avatar_id=NULL WHERE account_id='<account id>';   -- and/or banner_id=NULL
```

Delete `<media id>/full` and `<media id>/thumb` from the media store (the snippet below), and only then:

```sql
DELETE FROM media_objects WHERE id='<media id>';
INSERT INTO social_moderation_actions (target_kind,target_id,action,note,moderator)
VALUES ('account','<account id>','delete','removed avatar <media id>','<your name>');
```

If the blob delete fails, keep the row. The hourly sweep removes unreferenced media with its blobs.

## Hide or restore a post

```sql
UPDATE social_posts SET hidden=true WHERE id='<post id>';   -- restore: hidden=false
INSERT INTO social_moderation_actions (target_kind,target_id,action,note,moderator)
VALUES ('post','<post id>','hide','<why>','<your name>');   -- or 'restore'
```

## Delete a post

Prefer hiding (above): it needs no blob work and can be reversed. The author's own Delete in the app removes the media and blobs automatically. Use this runbook only when a post must be removed by an operator.

First capture the media ids and delete their blobs (snippet below). Then run the rest in one transaction. A post with replies stays as a tombstone.

```sql
SELECT media_id FROM social_post_media WHERE post_id='<post id>';
-- delete the blobs for each id, then:
BEGIN;
DELETE FROM social_post_media WHERE post_id='<post id>';
DELETE FROM media_objects WHERE id IN ('<media id>', '<media id>');
DELETE FROM social_likes WHERE post_id='<post id>';
UPDATE social_posts SET deleted=true,body='',hidden=false WHERE id='<post id>';
INSERT INTO social_moderation_actions (target_kind,target_id,action,note,moderator)
VALUES ('post','<post id>','delete','<why>','<your name>');
COMMIT;
```

The database rows are not the stored files. Delete the blobs `<id>/full` and `<id>/thumb` for each captured media id from the media store before deleting the rows. A developer runs, for each id:

```sh
node --input-type=module -e "const {netlifyMediaStore}=await import('./netlify/lib/media-store.mts');const s=await netlifyMediaStore();for(const v of ['full','thumb'])await s.delete('<media id>/'+v)"
```

This needs Netlify credentials for the site (for example via `netlify dev` or `netlify env`). Do the blobs first: if you delete the rows first, nothing remains that points at the blobs.

## Remove an account's data

The app has no account-deletion UI. Deleting an `accounts` row cascades its `media_objects` rows, so remove the blobs first. List the ids, delete the blobs for each (snippet above), then delete the account:

```sql
SELECT id FROM media_objects WHERE owner_id='<account id>';
-- delete <id>/full and <id>/thumb from the media store for each id, then:
DELETE FROM accounts WHERE id='<account id>';
```

Media that friends' snaps left behind is removed by the hourly orphan sweep.

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
