CREATE TYPE "public"."notification_type" AS ENUM('task_assigned', 'workflow_completed', 'workflow_failed', 'team_invite', 'agent_offline', 'message_received');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workflow_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"template_uuid" uuid DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" text,
	"category" varchar(100) DEFAULT 'general' NOT NULL,
	"definition" jsonb NOT NULL,
	"is_public" boolean DEFAULT true NOT NULL,
	"created_by_user_uuid" uuid,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workflow_templates_template_uuid_unique" UNIQUE("template_uuid")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"notification_uuid" uuid DEFAULT gen_random_uuid() NOT NULL,
	"user_uuid" uuid NOT NULL,
	"type" "notification_type" NOT NULL,
	"title" varchar(300) NOT NULL,
	"body" text,
	"metadata" jsonb,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_notification_uuid_unique" UNIQUE("notification_uuid")
);
