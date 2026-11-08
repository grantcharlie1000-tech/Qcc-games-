-- SCHEMA CHANGE: NEEDS CHARLIE APPROVAL before application. Never run against a remote DB from this task.
-- QCC Social and QCC Chat: profiles, media, posts, relationships, reports and chat.
CREATE TABLE social_profiles (
 account_id uuid PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
 display_name varchar(40) NOT NULL DEFAULT '',
 bio varchar(160) NOT NULL DEFAULT '',
 avatar_id text NULL,
 banner_id text NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE media_objects (
 id text PRIMARY KEY CHECK (id ~ '^m_[a-f0-9]{32}$'),
 owner_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 purpose text NOT NULL CHECK (purpose IN ('post','snap','avatar','banner')),
 state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','attached')),
 bytes integer NOT NULL CHECK (bytes>0 AND bytes<=1048576),
 thumb_bytes integer NOT NULL DEFAULT 0,
 width integer NOT NULL,
 height integer NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX media_objects_owner ON media_objects(owner_id,created_at);
CREATE INDEX media_objects_state ON media_objects(state,created_at);
CREATE TABLE social_posts (
 id uuid PRIMARY KEY,
 author_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 body text NOT NULL DEFAULT '' CHECK (char_length(body)<=280),
 reply_to uuid NULL REFERENCES social_posts(id) ON DELETE SET NULL,
 deleted boolean NOT NULL DEFAULT false,
 hidden boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX social_posts_author ON social_posts(author_id,created_at DESC,id DESC);
CREATE INDEX social_posts_timeline ON social_posts(created_at DESC,id DESC) WHERE reply_to IS NULL;
CREATE INDEX social_posts_replies ON social_posts(reply_to,created_at);
CREATE TABLE social_post_media (
 post_id uuid REFERENCES social_posts(id) ON DELETE CASCADE,
 position smallint CHECK (position BETWEEN 0 AND 3),
 media_id text NOT NULL REFERENCES media_objects(id) ON DELETE CASCADE,
 PRIMARY KEY (post_id,position)
);
CREATE TABLE social_likes (
 post_id uuid REFERENCES social_posts(id) ON DELETE CASCADE,
 account_id uuid REFERENCES accounts(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (post_id,account_id)
);
CREATE INDEX social_likes_account ON social_likes(account_id,created_at DESC);
CREATE TABLE social_follows (
 follower_id uuid REFERENCES accounts(id) ON DELETE CASCADE,
 followee_id uuid REFERENCES accounts(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (follower_id,followee_id),
 CHECK (follower_id<>followee_id)
);
CREATE INDEX social_follows_followee ON social_follows(followee_id);
CREATE TABLE social_blocks (
 blocker_id uuid REFERENCES accounts(id) ON DELETE CASCADE,
 blocked_id uuid REFERENCES accounts(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (blocker_id,blocked_id),
 CHECK (blocker_id<>blocked_id)
);
CREATE INDEX social_blocks_blocked ON social_blocks(blocked_id);
CREATE TABLE social_reports (
 id bigserial PRIMARY KEY,
 reporter_id uuid NULL REFERENCES accounts(id) ON DELETE SET NULL,
 target_kind text NOT NULL CHECK (target_kind IN ('post','account','message')),
 target_id text NOT NULL,
 target_account_id uuid NULL REFERENCES accounts(id) ON DELETE SET NULL,
 category text NOT NULL CHECK (category IN ('spam','harassment','hate','sexual','self-harm','private-info','other')),
 note varchar(500) NOT NULL DEFAULT '',
 snapshot varchar(1000) NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 resolved_at timestamptz NULL
);
CREATE UNIQUE INDEX social_reports_once ON social_reports(reporter_id,target_kind,target_id);
CREATE TABLE social_moderation_actions (
 id bigserial PRIMARY KEY,
 target_kind text NOT NULL,
 target_id text NOT NULL,
 action text NOT NULL CHECK (action IN ('hide','restore','delete','dismiss')),
 note text NOT NULL DEFAULT '',
 moderator text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
-- A friendship exists when both directions exist.
CREATE TABLE chat_contacts (
 owner_id uuid REFERENCES accounts(id) ON DELETE CASCADE,
 contact_id uuid REFERENCES accounts(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (owner_id,contact_id),
 CHECK (owner_id<>contact_id)
);
CREATE INDEX chat_contacts_contact ON chat_contacts(contact_id);
CREATE TABLE chat_conversations (
 id uuid PRIMARY KEY,
 a_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 b_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 retention text NOT NULL DEFAULT 'viewed' CHECK (retention IN ('viewed','week')),
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK (a_id<b_id),
 UNIQUE (a_id,b_id)
);
CREATE TABLE chat_messages (
 id bigserial PRIMARY KEY,
 conversation_id uuid NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
 sender_id uuid NULL REFERENCES accounts(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK (kind IN ('text','snap','system')),
 body varchar(1000) NULL,
 media_id text NULL REFERENCES media_objects(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 viewed_at timestamptz NULL,
 saved_at timestamptz NULL,
 expires_at timestamptz NOT NULL
);
CREATE INDEX chat_messages_conversation ON chat_messages(conversation_id,id);
CREATE INDEX chat_messages_expiry ON chat_messages(expires_at);
-- Reference checks for the hourly orphan-media sweep and media FK actions.
CREATE INDEX chat_messages_media ON chat_messages(media_id) WHERE media_id IS NOT NULL;
CREATE INDEX social_post_media_media ON social_post_media(media_id);
CREATE INDEX social_profiles_avatar ON social_profiles(avatar_id) WHERE avatar_id IS NOT NULL;
CREATE INDEX social_profiles_banner ON social_profiles(banner_id) WHERE banner_id IS NOT NULL;
REVOKE ALL ON social_profiles,media_objects,social_posts,social_post_media,social_likes,social_follows,social_blocks,social_reports,social_moderation_actions,chat_contacts,chat_conversations,chat_messages FROM PUBLIC;
