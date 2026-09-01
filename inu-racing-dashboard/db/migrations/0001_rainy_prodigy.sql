CREATE TABLE "settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"battery_temp_max" real DEFAULT 65 NOT NULL,
	"battery_voltage_max" real DEFAULT 100 NOT NULL,
	"battery_current_max" real DEFAULT 340 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;