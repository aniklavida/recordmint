CREATE TYPE "public"."trim_status" AS ENUM('none', 'pending', 'processing', 'ready', 'failed');--> statement-breakpoint
ALTER TABLE "recordings" ADD COLUMN "trim_status" "trim_status" DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "recordings" ADD COLUMN "trim_start_seconds" real;--> statement-breakpoint
ALTER TABLE "recordings" ADD COLUMN "trim_end_seconds" real;--> statement-breakpoint
ALTER TABLE "recordings" ADD COLUMN "trimmed_object_key" text;--> statement-breakpoint
ALTER TABLE "recordings" ADD COLUMN "trimmed_duration_seconds" real;--> statement-breakpoint
ALTER TABLE "recordings" ADD COLUMN "trim_failure_reason" text;