CREATE TYPE "public"."webhook_delivery_status" AS ENUM('pending', 'success', 'failed', 'dead_letter');--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'builtin' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'agent_type')) THEN ALTER TYPE "public"."agent_type" ADD VALUE 'builtin'; END IF; END$$;--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
	"id" serial PRIMARY KEY NOT NULL,
	"delivery_uuid" uuid DEFAULT gen_random_uuid() NOT NULL,
	"webhook_uuid" uuid NOT NULL,
	"event_type" varchar(255) NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "webhook_delivery_status" DEFAULT 'pending' NOT NULL,
	"response_code" integer,
	"response_body" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"next_retry_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	CONSTRAINT "webhook_deliveries_delivery_uuid_unique" UNIQUE("delivery_uuid")
);
--> statement-breakpoint
CREATE TABLE "webhooks" (
	"id" serial PRIMARY KEY NOT NULL,
	"webhook_uuid" uuid DEFAULT gen_random_uuid() NOT NULL,
	"team_uuid" uuid NOT NULL,
	"url" varchar(2048) NOT NULL,
	"secret" varchar(255) NOT NULL,
	"events" text[] DEFAULT '{}' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"description" varchar(500),
	"created_by_user_uuid" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "webhooks_webhook_uuid_unique" UNIQUE("webhook_uuid")
);
--> statement-breakpoint
CREATE TABLE "task_metrics" (
	"id" serial PRIMARY KEY NOT NULL,
	"metric_uuid" uuid DEFAULT gen_random_uuid() NOT NULL,
	"task_uuid" uuid,
	"workflow_run_id" varchar(255),
	"stage_id" varchar(255),
	"agent_uuid" uuid,
	"agent_id" varchar(255),
	"team_uuid" uuid,
	"tokens_used" integer DEFAULT 0 NOT NULL,
	"prompt_tokens" integer DEFAULT 0 NOT NULL,
	"completion_tokens" integer DEFAULT 0 NOT NULL,
	"cost_cents" integer DEFAULT 0 NOT NULL,
	"latency_ms" integer DEFAULT 0 NOT NULL,
	"queue_wait_ms" integer,
	"provider" varchar(50),
	"model" varchar(100),
	"capability" varchar(255),
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "task_metrics_metric_uuid_unique" UNIQUE("metric_uuid")
);
--> statement-breakpoint
ALTER TABLE "kanban_tasks" ADD COLUMN "depends_on" uuid[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "kanban_tasks" ADD COLUMN "input_mapping" jsonb;--> statement-breakpoint
ALTER TABLE "kanban_tasks" ADD COLUMN "output" jsonb;--> statement-breakpoint
ALTER TABLE "kanban_tasks" ADD COLUMN "output_schema" jsonb;--> statement-breakpoint
ALTER TABLE "kanban_tasks" ADD COLUMN "max_retries" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "kanban_tasks" ADD COLUMN "retry_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "kanban_tasks" ADD COLUMN "timeout_ms" integer;--> statement-breakpoint
ALTER TABLE "kanban_tasks" ADD COLUMN "last_error" text;--> statement-breakpoint
ALTER TABLE "kanban_tasks" ADD COLUMN "progress_current" integer;--> statement-breakpoint
ALTER TABLE "kanban_tasks" ADD COLUMN "progress_total" integer;--> statement-breakpoint
ALTER TABLE "kanban_tasks" ADD COLUMN "progress_message" text;--> statement-breakpoint
CREATE INDEX "idx_webhook_deliveries_webhook_uuid" ON "webhook_deliveries" USING btree ("webhook_uuid");--> statement-breakpoint
CREATE INDEX "idx_webhook_deliveries_status" ON "webhook_deliveries" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_webhook_deliveries_next_retry" ON "webhook_deliveries" USING btree ("next_retry_at");--> statement-breakpoint
CREATE INDEX "idx_webhooks_team_uuid" ON "webhooks" USING btree ("team_uuid");--> statement-breakpoint
CREATE INDEX "idx_webhooks_active" ON "webhooks" USING btree ("active");--> statement-breakpoint
CREATE INDEX "idx_task_metrics_task_uuid" ON "task_metrics" USING btree ("task_uuid");--> statement-breakpoint
CREATE INDEX "idx_task_metrics_agent_uuid" ON "task_metrics" USING btree ("agent_uuid");--> statement-breakpoint
CREATE INDEX "idx_task_metrics_team_uuid" ON "task_metrics" USING btree ("team_uuid");--> statement-breakpoint
CREATE INDEX "idx_task_metrics_workflow_run_id" ON "task_metrics" USING btree ("workflow_run_id");--> statement-breakpoint
CREATE INDEX "idx_task_metrics_created_at" ON "task_metrics" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_kanban_tasks_depends_on" ON "kanban_tasks" USING btree ("depends_on");