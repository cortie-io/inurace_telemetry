CREATE TABLE "bookmarks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"label" text NOT NULL,
	"ts" timestamp with time zone DEFAULT now() NOT NULL,
	"session_elapsed_ms" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_key" text NOT NULL,
	"token_hash" text NOT NULL,
	"label" text NOT NULL,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "devices_device_key_unique" UNIQUE("device_key")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" uuid NOT NULL,
	"name" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"max_speed" real DEFAULT 0 NOT NULL,
	"max_battery_temp" real DEFAULT 0 NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"display_name" text NOT NULL,
	"role" text DEFAULT 'crew' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;