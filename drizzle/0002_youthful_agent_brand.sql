ALTER TABLE "requirement_definition" ADD COLUMN "options" jsonb;--> statement-breakpoint
ALTER TABLE "assignment" ADD COLUMN "draft_value" jsonb;--> statement-breakpoint
ALTER TABLE "assignment" ADD COLUMN "draft_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "requirement" ADD COLUMN "options" jsonb;--> statement-breakpoint
CREATE INDEX "party_case_id_idx" ON "party" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "assignment_requirement_id_idx" ON "assignment" USING btree ("requirement_id");--> statement-breakpoint
CREATE INDEX "assignment_party_id_idx" ON "assignment" USING btree ("party_id");--> statement-breakpoint
CREATE INDEX "requirement_case_id_idx" ON "requirement" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "file_asset_submission_version_id_idx" ON "file_asset" USING btree ("submission_version_id");--> statement-breakpoint
CREATE INDEX "review_submission_version_id_idx" ON "review" USING btree ("submission_version_id");--> statement-breakpoint
CREATE INDEX "submission_answer_submission_version_id_idx" ON "submission_answer" USING btree ("submission_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "submission_version_assignment_id_version_number_key" ON "submission_version" USING btree ("assignment_id","version_number");--> statement-breakpoint
CREATE INDEX "access_token_case_id_idx" ON "access_token" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "audit_event_case_id_occurred_at_idx" ON "audit_event" USING btree ("case_id","occurred_at");