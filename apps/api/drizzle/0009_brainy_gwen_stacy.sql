CREATE TYPE "public"."memory_type" AS ENUM('episodic', 'semantic', 'working');--> statement-breakpoint
CREATE TYPE "public"."conflict_strategy" AS ENUM('fail', 'queue', 'merge', 'escalate');--> statement-breakpoint
CREATE TYPE "public"."lock_status" AS ENUM('active', 'released', 'expired');--> statement-breakpoint
CREATE TYPE "public"."budget_action" AS ENUM('pause', 'notify', 'kill');--> statement-breakpoint
CREATE TYPE "public"."budget_period" AS ENUM('daily', 'weekly', 'monthly', 'total');--> statement-breakpoint
CREATE TYPE "public"."budget_scope" AS ENUM('agent', 'workflow', 'team');--> statement-breakpoint
CREATE TYPE "public"."agent_role" AS ENUM('researcher', 'executor', 'deployer', 'auditor', 'admin');--> statement-breakpoint
CREATE TYPE "public"."deployment_strategy" AS ENUM('direct', 'canary', 'blue_green');--> statement-breakpoint
CREATE TYPE "public"."version_status" AS ENUM('draft', 'active', 'canary', 'inactive', 'rolled_back');--> statement-breakpoint
CREATE TYPE "public"."sandbox_mode" AS ENUM('dry_run', 'shadow', 'isolated');--> statement-breakpoint
CREATE TYPE "public"."sandbox_status" AS ENUM('running', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "agent_memory" (
	"id" serial PRIMARY KEY NOT NULL,
	"memory_uuid" uuid DEFAULT gen_random_uuid() NOT NULL,
	"agent_uuid" uuid NOT NULL,
	"memory_type" "memory_type" NOT NULL,
	"category" varchar(255),
	"title" varchar(500) NOT NULL,
	"content" text NOT NULL,
	"metadata" jsonb,
	"embedding" text,
	"importance" integer DEFAULT 5 NOT NULL,
	"access_count" integer DEFAULT 0 NOT NULL,
	"last_accessed_at" timestamp,
	"expires_at" timestamp,
	"workflow_run_id" varchar(255),
	"team_uuid" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "agent_memory_memory_uuid_unique" UNIQUE("memory_uuid")
);
--> statement-breakpoint
CREATE TABLE "resource_locks" (
	"id" serial PRIMARY KEY NOT NULL,
	"lock_uuid" uuid DEFAULT gen_random_uuid() NOT NULL,
	"resource_type" varchar(100) NOT NULL,
	"resource_id" varchar(500) NOT NULL,
	"owner_agent_uuid" uuid NOT NULL,
	"owner_workflow_run_id" varchar(255),
	"version" integer DEFAULT 1 NOT NULL,
	"content_hash" varchar(128),
	"conflict_strategy" "conflict_strategy" DEFAULT 'fail' NOT NULL,
	"lock_status" "lock_status" DEFAULT 'active' NOT NULL,
	"metadata" jsonb,
	"acquired_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"released_at" timestamp,
	"team_uuid" uuid,
	CONSTRAINT "resource_locks_lock_uuid_unique" UNIQUE("lock_uuid")
);
--> statement-breakpoint
CREATE TABLE "budgets" (
	"id" serial PRIMARY KEY NOT NULL,
	"budget_uuid" uuid DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"scope" "budget_scope" NOT NULL,
	"scope_uuid" uuid NOT NULL,
	"max_cost_cents" integer NOT NULL,
	"alert_threshold_percent" integer DEFAULT 80 NOT NULL,
	"action_at_limit" "budget_action" DEFAULT 'pause' NOT NULL,
	"period" "budget_period" DEFAULT 'monthly' NOT NULL,
	"current_spend_cents" integer DEFAULT 0 NOT NULL,
	"period_start_at" timestamp DEFAULT now() NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"alert_sent" boolean DEFAULT false NOT NULL,
	"created_by_user_uuid" uuid NOT NULL,
	"team_uuid" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "budgets_budget_uuid_unique" UNIQUE("budget_uuid")
);
--> statement-breakpoint
CREATE TABLE "agent_permission_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"log_uuid" uuid DEFAULT gen_random_uuid() NOT NULL,
	"agent_uuid" uuid NOT NULL,
	"action" varchar(100) NOT NULL,
	"resource" varchar(500),
	"capability" varchar(255),
	"allowed" boolean NOT NULL,
	"reason" text,
	"metadata" jsonb,
	"checked_by_user_uuid" uuid,
	"team_uuid" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "agent_permission_logs_log_uuid_unique" UNIQUE("log_uuid")
);
--> statement-breakpoint
CREATE TABLE "agent_permissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"permission_uuid" uuid DEFAULT gen_random_uuid() NOT NULL,
	"agent_uuid" uuid NOT NULL,
	"agent_role" "agent_role" DEFAULT 'executor' NOT NULL,
	"allowed_capabilities" text[] DEFAULT '{}',
	"denied_capabilities" text[] DEFAULT '{}',
	"allowed_resources" jsonb,
	"denied_resources" jsonb,
	"can_call_external_apis" boolean DEFAULT true NOT NULL,
	"can_access_production" boolean DEFAULT false NOT NULL,
	"can_modify_data" boolean DEFAULT true NOT NULL,
	"can_delegate_to_agents" boolean DEFAULT false NOT NULL,
	"max_concurrent_ops" varchar(10),
	"description" text,
	"granted_by_user_uuid" uuid NOT NULL,
	"team_uuid" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "agent_permissions_permission_uuid_unique" UNIQUE("permission_uuid")
);
--> statement-breakpoint
CREATE TABLE "agent_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"version_uuid" uuid DEFAULT gen_random_uuid() NOT NULL,
	"agent_uuid" uuid NOT NULL,
	"version" varchar(50) NOT NULL,
	"endpoint" varchar(2048) NOT NULL,
	"capabilities" text[] DEFAULT '{}' NOT NULL,
	"config" jsonb,
	"version_status" "version_status" DEFAULT 'draft' NOT NULL,
	"deployment_strategy" "deployment_strategy" DEFAULT 'direct' NOT NULL,
	"traffic_percent" integer DEFAULT 0 NOT NULL,
	"error_rate" integer DEFAULT 0 NOT NULL,
	"error_threshold" integer DEFAULT 50 NOT NULL,
	"total_requests" integer DEFAULT 0 NOT NULL,
	"total_errors" integer DEFAULT 0 NOT NULL,
	"is_rollback_target" boolean DEFAULT false NOT NULL,
	"release_notes" text,
	"created_by_user_uuid" uuid NOT NULL,
	"promoted_at" timestamp,
	"rolled_back_at" timestamp,
	"team_uuid" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "agent_versions_version_uuid_unique" UNIQUE("version_uuid")
);
--> statement-breakpoint
CREATE TABLE "sandbox_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"sandbox_uuid" uuid DEFAULT gen_random_uuid() NOT NULL,
	"workflow_run_id" varchar(255),
	"sandbox_mode" "sandbox_mode" NOT NULL,
	"sandbox_status" "sandbox_status" DEFAULT 'running' NOT NULL,
	"workflow_definition" jsonb NOT NULL,
	"input" jsonb,
	"simulated_output" jsonb,
	"actual_output" jsonb,
	"diff" jsonb,
	"stage_results" jsonb,
	"side_effects_blocked" jsonb,
	"estimated_cost_cents" varchar(20),
	"warnings" text[] DEFAULT '{}',
	"created_by_user_uuid" uuid NOT NULL,
	"team_uuid" uuid,
	"sandbox_namespace" varchar(255),
	"isolate_network" boolean DEFAULT true NOT NULL,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sandbox_runs_sandbox_uuid_unique" UNIQUE("sandbox_uuid")
);
--> statement-breakpoint
CREATE INDEX "idx_agent_memory_agent_uuid" ON "agent_memory" USING btree ("agent_uuid");--> statement-breakpoint
CREATE INDEX "idx_agent_memory_type" ON "agent_memory" USING btree ("memory_type");--> statement-breakpoint
CREATE INDEX "idx_agent_memory_category" ON "agent_memory" USING btree ("category");--> statement-breakpoint
CREATE INDEX "idx_agent_memory_team_uuid" ON "agent_memory" USING btree ("team_uuid");--> statement-breakpoint
CREATE INDEX "idx_agent_memory_importance" ON "agent_memory" USING btree ("importance");--> statement-breakpoint
CREATE INDEX "idx_agent_memory_created_at" ON "agent_memory" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_resource_locks_resource" ON "resource_locks" USING btree ("resource_type","resource_id");--> statement-breakpoint
CREATE INDEX "idx_resource_locks_owner" ON "resource_locks" USING btree ("owner_agent_uuid");--> statement-breakpoint
CREATE INDEX "idx_resource_locks_status" ON "resource_locks" USING btree ("lock_status");--> statement-breakpoint
CREATE INDEX "idx_resource_locks_expires" ON "resource_locks" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_budgets_scope" ON "budgets" USING btree ("scope","scope_uuid");--> statement-breakpoint
CREATE INDEX "idx_budgets_team_uuid" ON "budgets" USING btree ("team_uuid");--> statement-breakpoint
CREATE INDEX "idx_budgets_active" ON "budgets" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_agent_perm_logs_agent_uuid" ON "agent_permission_logs" USING btree ("agent_uuid");--> statement-breakpoint
CREATE INDEX "idx_agent_perm_logs_action" ON "agent_permission_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "idx_agent_perm_logs_created_at" ON "agent_permission_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_agent_permissions_agent_uuid" ON "agent_permissions" USING btree ("agent_uuid");--> statement-breakpoint
CREATE INDEX "idx_agent_permissions_role" ON "agent_permissions" USING btree ("agent_role");--> statement-breakpoint
CREATE INDEX "idx_agent_permissions_team_uuid" ON "agent_permissions" USING btree ("team_uuid");--> statement-breakpoint
CREATE INDEX "idx_agent_versions_agent_uuid" ON "agent_versions" USING btree ("agent_uuid");--> statement-breakpoint
CREATE INDEX "idx_agent_versions_status" ON "agent_versions" USING btree ("version_status");--> statement-breakpoint
CREATE INDEX "idx_agent_versions_version" ON "agent_versions" USING btree ("agent_uuid","version");--> statement-breakpoint
CREATE INDEX "idx_sandbox_runs_user" ON "sandbox_runs" USING btree ("created_by_user_uuid");--> statement-breakpoint
CREATE INDEX "idx_sandbox_runs_mode" ON "sandbox_runs" USING btree ("sandbox_mode");--> statement-breakpoint
CREATE INDEX "idx_sandbox_runs_status" ON "sandbox_runs" USING btree ("sandbox_status");--> statement-breakpoint
CREATE INDEX "idx_sandbox_runs_team_uuid" ON "sandbox_runs" USING btree ("team_uuid");