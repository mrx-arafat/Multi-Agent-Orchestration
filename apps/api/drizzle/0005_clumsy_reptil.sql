CREATE TYPE "public"."agent_type" AS ENUM('generic', 'openclaw');--> statement-breakpoint
CREATE TYPE "public"."kanban_priority" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."kanban_status" AS ENUM('backlog', 'todo', 'in_progress', 'review', 'done');--> statement-breakpoint
CREATE TYPE "public"."message_type" AS ENUM('direct', 'broadcast', 'system');--> statement-breakpoint
CREATE TABLE "team_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_uuid" uuid NOT NULL,
	"user_uuid" uuid NOT NULL,
	"role" varchar(50) DEFAULT 'member' NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_uuid" uuid DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"owner_user_uuid" uuid NOT NULL,
	"max_agents" integer DEFAULT 10 NOT NULL,
	"settings" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"archived_at" timestamp,
	CONSTRAINT "teams_team_uuid_unique" UNIQUE("team_uuid")
);
--> statement-breakpoint
CREATE TABLE "kanban_tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"task_uuid" uuid DEFAULT gen_random_uuid() NOT NULL,
	"team_uuid" uuid NOT NULL,
	"workflow_run_id" varchar(255),
	"title" varchar(500) NOT NULL,
	"description" text,
	"status" "kanban_status" DEFAULT 'backlog' NOT NULL,
	"priority" "kanban_priority" DEFAULT 'medium' NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"assigned_agent_uuid" uuid,
	"created_by_agent_uuid" uuid,
	"created_by_user_uuid" uuid,
	"parent_task_uuid" uuid,
	"stage_id" varchar(255),
	"estimated_ms" integer,
	"actual_ms" integer,
	"result" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp,
	CONSTRAINT "kanban_tasks_task_uuid_unique" UNIQUE("task_uuid")
);
--> statement-breakpoint
CREATE TABLE "agent_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"message_uuid" uuid DEFAULT gen_random_uuid() NOT NULL,
	"team_uuid" uuid NOT NULL,
	"workflow_run_id" varchar(255),
	"from_agent_uuid" uuid,
	"to_agent_uuid" uuid,
	"message_type" "message_type" DEFAULT 'direct' NOT NULL,
	"subject" varchar(500),
	"content" text NOT NULL,
	"metadata" jsonb,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "agent_messages_message_uuid_unique" UNIQUE("message_uuid")
);
--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "agent_type" "agent_type" DEFAULT 'generic' NOT NULL;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "team_uuid" uuid;--> statement-breakpoint
CREATE INDEX "idx_team_members_team_uuid" ON "team_members" USING btree ("team_uuid");--> statement-breakpoint
CREATE INDEX "idx_team_members_user_uuid" ON "team_members" USING btree ("user_uuid");--> statement-breakpoint
CREATE INDEX "idx_teams_owner_user_uuid" ON "teams" USING btree ("owner_user_uuid");--> statement-breakpoint
CREATE INDEX "idx_kanban_tasks_team_uuid" ON "kanban_tasks" USING btree ("team_uuid");--> statement-breakpoint
CREATE INDEX "idx_kanban_tasks_status" ON "kanban_tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_kanban_tasks_assigned_agent" ON "kanban_tasks" USING btree ("assigned_agent_uuid");--> statement-breakpoint
CREATE INDEX "idx_agent_messages_team_uuid" ON "agent_messages" USING btree ("team_uuid");--> statement-breakpoint
CREATE INDEX "idx_agent_messages_to_agent" ON "agent_messages" USING btree ("to_agent_uuid");--> statement-breakpoint
CREATE INDEX "idx_agent_messages_from_agent" ON "agent_messages" USING btree ("from_agent_uuid");