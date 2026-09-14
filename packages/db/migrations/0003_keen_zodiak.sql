DO $$ BEGIN
 CREATE TYPE "public"."reaction_emoji" AS ENUM('👍', '❤️', '😂', '😮', '👏');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reactions" (
	"id" text PRIMARY KEY NOT NULL,
	"recording_id" text NOT NULL,
	"emoji" "reaction_emoji" NOT NULL,
	"timestamp_seconds" real NOT NULL,
	"timestamp_window" integer NOT NULL,
	"reactor_user_id" text,
	"reactor_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reactions_recording_emoji_window_reactor_key" UNIQUE("recording_id","emoji","timestamp_window","reactor_key")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reactions" ADD CONSTRAINT "reactions_recording_id_recordings_id_fk" FOREIGN KEY ("recording_id") REFERENCES "public"."recordings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reactions" ADD CONSTRAINT "reactions_reactor_user_id_users_id_fk" FOREIGN KEY ("reactor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reactions_recording_id_idx" ON "reactions" USING btree ("recording_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reactions_reactor_key_idx" ON "reactions" USING btree ("reactor_key");