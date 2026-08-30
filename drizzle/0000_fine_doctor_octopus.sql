CREATE TYPE "public"."action_type" AS ENUM('upload', 'answer', 'sign', 'acknowledge');--> statement-breakpoint
CREATE TYPE "public"."answer_field_type" AS ENUM('short_text', 'long_text', 'date', 'choice', 'yes_no');--> statement-breakpoint
CREATE TYPE "public"."auth_level" AS ENUM('link', 'link_email_reverify', 'link_otp', 'otp_out_of_band');--> statement-breakpoint
CREATE TYPE "public"."delivery_status" AS ENUM('queued', 'sent', 'delivered', 'bounced', 'suppressed');--> statement-breakpoint
CREATE TYPE "public"."fulfilment_status" AS ENUM('pending', 'viewed', 'in_progress', 'submitted', 'waived', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."malware_scan_status" AS ENUM('pending', 'quarantined', 'clean', 'infected', 'scan_failed');--> statement-breakpoint
CREATE TYPE "public"."party_type" AS ENUM('individual', 'organization');--> statement-breakpoint
CREATE TYPE "public"."requirement_sensitivity" AS ENUM('general', 'routine_business', 'tax_identity', 'banking', 'high_value_agreement');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('not_required', 'unreviewed', 'approved', 'changes_requested', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."signature_status" AS ENUM('not_sent', 'opened', 'signed', 'declined', 'voided', 'expired');--> statement-breakpoint
CREATE TYPE "public"."template_status" AS ENUM('draft', 'active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."validity_status" AS ENUM('not_applicable', 'current', 'expiring', 'expired');--> statement-breakpoint
CREATE TYPE "public"."workspace_role" AS ENUM('owner', 'member');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"password" text,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"billing_plan" text DEFAULT 'trial' NOT NULL,
	"retention_policy_days" text,
	"default_authentication_policy" "auth_level" DEFAULT 'link' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_member" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" "workspace_role" DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "requirement_definition" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"template_version_id" uuid NOT NULL,
	"action_type" "action_type" NOT NULL,
	"answer_field_type" "answer_field_type",
	"title" text NOT NULL,
	"instructions" text,
	"required" boolean DEFAULT true NOT NULL,
	"sequence" integer DEFAULT 0 NOT NULL,
	"acceptance_criteria" text,
	"sensitivity" "requirement_sensitivity" DEFAULT 'general' NOT NULL,
	"visibility_condition" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "template_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" "template_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_template" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "case" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"template_version_id" uuid NOT NULL,
	"name" text NOT NULL,
	"due_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_subject" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"subject_type" text NOT NULL,
	"display_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "party" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"party_type" "party_type" DEFAULT 'individual' NOT NULL,
	"display_name" text NOT NULL,
	"email" text,
	"phone" text,
	"organization_name" text,
	"ledger_subject_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assignment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"requirement_id" uuid NOT NULL,
	"party_id" uuid NOT NULL,
	"fulfilment_status" "fulfilment_status" DEFAULT 'pending' NOT NULL,
	"viewed_at" timestamp with time zone,
	"submitted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "requirement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"action_type" "action_type" NOT NULL,
	"answer_field_type" "answer_field_type",
	"title" text NOT NULL,
	"instructions" text,
	"required" boolean DEFAULT true NOT NULL,
	"sequence" integer DEFAULT 0 NOT NULL,
	"acceptance_criteria" text,
	"sensitivity" "requirement_sensitivity" DEFAULT 'general' NOT NULL,
	"due_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_validity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"submission_version_id" uuid NOT NULL,
	"ledger_subject_id" uuid NOT NULL,
	"valid_from" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"validity_status" "validity_status" DEFAULT 'not_applicable' NOT NULL,
	"responsible_user_id" text,
	"renewal_case_id" uuid
);
--> statement-breakpoint
CREATE TABLE "file_asset" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"submission_version_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"original_filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"byte_size" bigint NOT NULL,
	"sha256_hash" text NOT NULL,
	"malware_scan_status" "malware_scan_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "file_asset_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
CREATE TABLE "review" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"submission_version_id" uuid NOT NULL,
	"review_status" "review_status" DEFAULT 'unreviewed' NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"reason" text
);
--> statement-breakpoint
CREATE TABLE "submission_answer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"submission_version_id" uuid NOT NULL,
	"value" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "submission_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"assignment_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_by_party_id" uuid NOT NULL,
	"supersedes_submission_id" uuid
);
--> statement-breakpoint
CREATE TABLE "delivery_attempt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"reminder_dispatch_id" uuid,
	"party_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"status" "delivery_status" DEFAULT 'queued' NOT NULL,
	"provider_message_id" text,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"bounced_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "reminder_dispatch" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"assignment_id" uuid NOT NULL,
	"reminder_sequence" integer NOT NULL,
	"reason_snapshot" text,
	"dispatched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reminder_policy" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"cadence" text DEFAULT 'P2D' NOT NULL,
	"channels" jsonb DEFAULT '["email"]'::jsonb NOT NULL,
	"quiet_hours_start" integer DEFAULT 21 NOT NULL,
	"quiet_hours_end" integer DEFAULT 8 NOT NULL,
	"stop_condition" text DEFAULT 'all_submitted' NOT NULL,
	"unopened_cadence" text DEFAULT 'P1D' NOT NULL,
	"stalled_cadence" text DEFAULT 'P3D' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "access_token" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"party_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"auth_level" "auth_level" DEFAULT 'link' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "access_token_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "audit_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"case_id" uuid,
	"actor_type" text NOT NULL,
	"actor_id" text,
	"event_type" text NOT NULL,
	"object_type" text NOT NULL,
	"object_id" uuid,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" "inet",
	"user_agent" text,
	"metadata" jsonb,
	"previous_event_hash" text,
	"event_hash" text
);
--> statement-breakpoint
CREATE TABLE "signature_envelope" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"requirement_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_envelope_id" text,
	"document_hash" text,
	"signature_status" "signature_status" DEFAULT 'not_sent' NOT NULL,
	"completed_document_asset_id" uuid,
	"evidence_asset_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_member" ADD CONSTRAINT "workspace_member_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_member" ADD CONSTRAINT "workspace_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_definition" ADD CONSTRAINT "requirement_definition_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_definition" ADD CONSTRAINT "requirement_definition_template_version_id_template_version_id_fk" FOREIGN KEY ("template_version_id") REFERENCES "public"."template_version"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_version" ADD CONSTRAINT "template_version_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_version" ADD CONSTRAINT "template_version_template_id_workflow_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."workflow_template"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_template" ADD CONSTRAINT "workflow_template_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case" ADD CONSTRAINT "case_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case" ADD CONSTRAINT "case_template_version_id_template_version_id_fk" FOREIGN KEY ("template_version_id") REFERENCES "public"."template_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case" ADD CONSTRAINT "case_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_subject" ADD CONSTRAINT "ledger_subject_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "party" ADD CONSTRAINT "party_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "party" ADD CONSTRAINT "party_case_id_case_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."case"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "party" ADD CONSTRAINT "party_ledger_subject_id_ledger_subject_id_fk" FOREIGN KEY ("ledger_subject_id") REFERENCES "public"."ledger_subject"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment" ADD CONSTRAINT "assignment_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment" ADD CONSTRAINT "assignment_requirement_id_requirement_id_fk" FOREIGN KEY ("requirement_id") REFERENCES "public"."requirement"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment" ADD CONSTRAINT "assignment_party_id_party_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."party"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement" ADD CONSTRAINT "requirement_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement" ADD CONSTRAINT "requirement_case_id_case_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."case"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_validity" ADD CONSTRAINT "document_validity_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_validity" ADD CONSTRAINT "document_validity_submission_version_id_submission_version_id_fk" FOREIGN KEY ("submission_version_id") REFERENCES "public"."submission_version"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_validity" ADD CONSTRAINT "document_validity_ledger_subject_id_ledger_subject_id_fk" FOREIGN KEY ("ledger_subject_id") REFERENCES "public"."ledger_subject"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_validity" ADD CONSTRAINT "document_validity_responsible_user_id_user_id_fk" FOREIGN KEY ("responsible_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_asset" ADD CONSTRAINT "file_asset_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_asset" ADD CONSTRAINT "file_asset_submission_version_id_submission_version_id_fk" FOREIGN KEY ("submission_version_id") REFERENCES "public"."submission_version"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review" ADD CONSTRAINT "review_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review" ADD CONSTRAINT "review_submission_version_id_submission_version_id_fk" FOREIGN KEY ("submission_version_id") REFERENCES "public"."submission_version"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review" ADD CONSTRAINT "review_reviewed_by_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_answer" ADD CONSTRAINT "submission_answer_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_answer" ADD CONSTRAINT "submission_answer_submission_version_id_submission_version_id_fk" FOREIGN KEY ("submission_version_id") REFERENCES "public"."submission_version"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_version" ADD CONSTRAINT "submission_version_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_version" ADD CONSTRAINT "submission_version_assignment_id_assignment_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_version" ADD CONSTRAINT "submission_version_submitted_by_party_id_party_id_fk" FOREIGN KEY ("submitted_by_party_id") REFERENCES "public"."party"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_attempt" ADD CONSTRAINT "delivery_attempt_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_attempt" ADD CONSTRAINT "delivery_attempt_reminder_dispatch_id_reminder_dispatch_id_fk" FOREIGN KEY ("reminder_dispatch_id") REFERENCES "public"."reminder_dispatch"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_attempt" ADD CONSTRAINT "delivery_attempt_party_id_party_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."party"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_dispatch" ADD CONSTRAINT "reminder_dispatch_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_dispatch" ADD CONSTRAINT "reminder_dispatch_assignment_id_assignment_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_policy" ADD CONSTRAINT "reminder_policy_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_policy" ADD CONSTRAINT "reminder_policy_case_id_case_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."case"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_token" ADD CONSTRAINT "access_token_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_token" ADD CONSTRAINT "access_token_case_id_case_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."case"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_token" ADD CONSTRAINT "access_token_party_id_party_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."party"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_case_id_case_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."case"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signature_envelope" ADD CONSTRAINT "signature_envelope_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signature_envelope" ADD CONSTRAINT "signature_envelope_requirement_id_requirement_id_fk" FOREIGN KEY ("requirement_id") REFERENCES "public"."requirement"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signature_envelope" ADD CONSTRAINT "signature_envelope_completed_document_asset_id_file_asset_id_fk" FOREIGN KEY ("completed_document_asset_id") REFERENCES "public"."file_asset"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signature_envelope" ADD CONSTRAINT "signature_envelope_evidence_asset_id_file_asset_id_fk" FOREIGN KEY ("evidence_asset_id") REFERENCES "public"."file_asset"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reminder_dispatch_assignment_id_reminder_sequence_key" ON "reminder_dispatch" USING btree ("assignment_id","reminder_sequence");