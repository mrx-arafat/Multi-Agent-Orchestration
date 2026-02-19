CREATE TABLE "api_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"token_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"user_uuid" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"token_hash" varchar(255) NOT NULL,
	"token_prefix" varchar(12) NOT NULL,
	"scopes" text[] DEFAULT '{}' NOT NULL,
	"last_used_at" timestamp,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"revoked_at" timestamp,
	CONSTRAINT "api_tokens_token_id_unique" UNIQUE("token_id"),
	CONSTRAINT "api_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE INDEX "idx_api_tokens_user_uuid" ON "api_tokens" USING btree ("user_uuid");--> statement-breakpoint
CREATE INDEX "idx_api_tokens_token_hash" ON "api_tokens" USING btree ("token_hash");