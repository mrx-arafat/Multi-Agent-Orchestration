-- Phase 4: Add 'builtin' to agent_type enum for in-process AI agents
ALTER TYPE "public"."agent_type" ADD VALUE IF NOT EXISTS 'builtin';
