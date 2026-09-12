DROP INDEX "review_submission_version_id_idx";--> statement-breakpoint
ALTER TABLE "review" ALTER COLUMN "review_status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "review" ALTER COLUMN "reviewed_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "review" ALTER COLUMN "reviewed_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "review" ADD COLUMN "review_number" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "submission_version" ADD CONSTRAINT "submission_version_supersedes_fk" FOREIGN KEY ("supersedes_submission_id") REFERENCES "public"."submission_version"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "review_submission_version_id_review_number_key" ON "review" USING btree ("submission_version_id","review_number");--> statement-breakpoint
ALTER TABLE "review" ADD CONSTRAINT "review_status_decision" CHECK ("review"."review_status" IN ('approved', 'changes_requested', 'rejected'));--> statement-breakpoint
ALTER TABLE "review" ADD CONSTRAINT "review_reason_required" CHECK ("review"."review_status" = 'approved' OR ("review"."reason" IS NOT NULL AND btrim("review"."reason") <> ''));