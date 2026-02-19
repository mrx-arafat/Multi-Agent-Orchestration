CREATE INDEX "idx_workflow_runs_user_uuid" ON "workflow_runs" USING btree ("user_uuid");--> statement-breakpoint
CREATE INDEX "idx_workflow_runs_status" ON "workflow_runs" USING btree ("status");