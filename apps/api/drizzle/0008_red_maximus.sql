CREATE TYPE "public"."approval_status" AS ENUM('pending', 'approved', 'rejected', 'expired');--> statement-breakpoint
CREATE TABLE "approval_gates" (
	"id" serial PRIMARY KEY NOT NULL,
	"gate_uuid" uuid DEFAULT gen_random_uuid() NOT NULL,
	"team_uuid" uuid NOT NULL,
	"task_uuid" uuid,
	"workflow_run_id" varchar(255),
	"stage_id" varchar(255),
	"title" varchar(500) NOT NULL,
	"description" text,
	"status" "approval_status" DEFAULT 'pending' NOT NULL,
	"requested_by_agent_uuid" uuid,
	"requested_by_user_uuid" uuid,
	"approvers" text[] DEFAULT '{}' NOT NULL,
	"responded_by_user_uuid" uuid,
	"response_note" text,
	"expires_at" timestamp,
	"context" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"responded_at" timestamp,
	CONSTRAINT "approval_gates_gate_uuid_unique" UNIQUE("gate_uuid")
);
--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "ws_connected" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "last_heartbeat" timestamp;--> statement-breakpoint
CREATE INDEX "idx_approval_gates_team_uuid" ON "approval_gates" USING btree ("team_uuid");--> statement-breakpoint
CREATE INDEX "idx_approval_gates_status" ON "approval_gates" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_approval_gates_task_uuid" ON "approval_gates" USING btree ("task_uuid");--> statement-breakpoint
CREATE INDEX "idx_approval_gates_workflow_run_id" ON "approval_gates" USING btree ("workflow_run_id");