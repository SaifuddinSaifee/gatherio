CREATE TYPE "public"."reminder_trigger" AS ENUM('scheduled', 'manual', 'conditional');--> statement-breakpoint
ALTER TYPE "public"."delivery_status" ADD VALUE 'failed';--> statement-breakpoint
ALTER TABLE "delivery_attempt" DROP CONSTRAINT "delivery_attempt_reminder_dispatch_id_reminder_dispatch_id_fk";
--> statement-breakpoint
DROP INDEX "reminder_dispatch_assignment_id_reminder_sequence_key";--> statement-breakpoint
ALTER TABLE "reminder_dispatch" ALTER COLUMN "reminder_sequence" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "delivery_attempt" ADD COLUMN "template_ref" text NOT NULL;--> statement-breakpoint
ALTER TABLE "delivery_attempt" ADD COLUMN "sent_by_user_id" text;--> statement-breakpoint
ALTER TABLE "delivery_attempt" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "delivery_attempt" ADD COLUMN "error" text;--> statement-breakpoint
ALTER TABLE "delivery_attempt" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "reminder_dispatch" ADD COLUMN "trigger_type" "reminder_trigger" DEFAULT 'scheduled' NOT NULL;--> statement-breakpoint
ALTER TABLE "reminder_dispatch" ADD COLUMN "delivery_attempt_id" uuid;--> statement-breakpoint
ALTER TABLE "delivery_attempt" ADD CONSTRAINT "delivery_attempt_sent_by_user_id_user_id_fk" FOREIGN KEY ("sent_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_dispatch" ADD CONSTRAINT "reminder_dispatch_delivery_attempt_id_delivery_attempt_id_fk" FOREIGN KEY ("delivery_attempt_id") REFERENCES "public"."delivery_attempt"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "delivery_attempt_party_id_created_at_idx" ON "delivery_attempt" USING btree ("party_id","created_at");--> statement-breakpoint
CREATE INDEX "reminder_dispatch_delivery_attempt_id_idx" ON "reminder_dispatch" USING btree ("delivery_attempt_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reminder_dispatch_assignment_id_reminder_sequence_key" ON "reminder_dispatch" USING btree ("assignment_id","reminder_sequence") WHERE "reminder_dispatch"."trigger_type" = 'scheduled';--> statement-breakpoint
ALTER TABLE "reminder_dispatch" ADD CONSTRAINT "reminder_dispatch_sequence_matches_trigger" CHECK (("reminder_dispatch"."trigger_type" = 'scheduled') = ("reminder_dispatch"."reminder_sequence" IS NOT NULL));