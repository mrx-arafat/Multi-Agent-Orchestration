CREATE TYPE "public"."user_role" AS ENUM('admin', 'user');--> statement-breakpoint
CREATE TYPE "public"."agent_status" AS ENUM('online', 'degraded', 'offline');--> statement-breakpoint
CREATE TYPE "public"."workflow_status" AS ENUM('queued', 'in_progress', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."stage_status" AS ENUM('queued', 'in_progress', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_uuid" uuid DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "users_user_uuid_unique" UNIQUE("user_uuid"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"id" serial PRIMARY KEY NOT NULL,
	"agent_uuid" uuid DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"capabilities" text[] DEFAULT '{}' NOT NULL,
	"endpoint" varchar(2048) NOT NULL,
	"auth_token_hash" varchar(255) NOT NULL,
	"max_concurrent_tasks" integer DEFAULT 5 NOT NULL,
	"description" text,
	"status" "agent_status" DEFAULT 'offline' NOT NULL,
	"last_health_check" timestamp,
	"registered_by_user_uuid" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "agents_agent_uuid_unique" UNIQUE("agent_uuid"),
	CONSTRAINT "agents_agent_id_unique" UNIQUE("agent_id")
);
--> statement-breakpoint
CREATE TABLE "workflow_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"workflow_run_id" varchar(255) NOT NULL,
	"user_uuid" uuid NOT NULL,
	"workflow_name" varchar(255) NOT NULL,
	"workflow_definition" jsonb NOT NULL,
	"input" jsonb NOT NULL,
	"status" "workflow_status" DEFAULT 'queued' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp,
	"error_message" text,
	CONSTRAINT "workflow_runs_workflow_run_id_unique" UNIQUE("workflow_run_id")
);
--> statement-breakpoint
CREATE TABLE "stage_executions" (
	"id" serial PRIMARY KEY NOT NULL,
	"workflow_run_id" varchar(255) NOT NULL,
	"stage_id" varchar(255) NOT NULL,
	"agent_id" varchar(255) NOT NULL,
	"status" "stage_status" DEFAULT 'queued' NOT NULL,
	"input" jsonb,
	"output" jsonb,
	"started_at" timestamp,
	"completed_at" timestamp,
	"execution_time_ms" integer,
	"error_message" varchar(2048)
);
--> statement-breakpoint
CREATE TABLE "execution_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"workflow_run_id" varchar(255) NOT NULL,
	"stage_id" varchar(255) NOT NULL,
	"agent_id" varchar(255) NOT NULL,
	"action" varchar(50) NOT NULL,
	"input_hash" varchar(255),
	"output_hash" varchar(255),
	"status" varchar(50) NOT NULL,
	"signature" jsonb,
	"logged_at" timestamp DEFAULT now() NOT NULL
);
