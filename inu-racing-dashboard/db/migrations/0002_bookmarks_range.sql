ALTER TABLE "bookmarks" DROP COLUMN "ts";--> statement-breakpoint
ALTER TABLE "bookmarks" DROP COLUMN "session_elapsed_ms";--> statement-breakpoint
ALTER TABLE "bookmarks" ADD COLUMN "start_ts" timestamp with time zone NOT NULL;--> statement-breakpoint
ALTER TABLE "bookmarks" ADD COLUMN "end_ts" timestamp with time zone NOT NULL;--> statement-breakpoint
ALTER TABLE "bookmarks" ADD COLUMN "start_elapsed_ms" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "bookmarks" ADD COLUMN "end_elapsed_ms" integer NOT NULL;
