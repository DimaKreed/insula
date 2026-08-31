CREATE TABLE "audio_assets" (
	"id" text PRIMARY KEY NOT NULL,
	"content_hash" text NOT NULL,
	"provider" text NOT NULL,
	"voice_id" text NOT NULL,
	"lang" text NOT NULL,
	"storage_key" text NOT NULL,
	"url" text NOT NULL,
	"duration_ms" integer,
	"char_count" integer NOT NULL,
	"byte_size" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audio_assets_content_hash_unique" UNIQUE("content_hash")
);
--> statement-breakpoint
ALTER TABLE "sentences" ADD COLUMN "target_audio_id" text;--> statement-breakpoint
ALTER TABLE "sentences" ADD COLUMN "prompt_audio_id" text;--> statement-breakpoint
ALTER TABLE "sentences" ADD CONSTRAINT "sentences_target_audio_id_audio_assets_id_fk" FOREIGN KEY ("target_audio_id") REFERENCES "public"."audio_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentences" ADD CONSTRAINT "sentences_prompt_audio_id_audio_assets_id_fk" FOREIGN KEY ("prompt_audio_id") REFERENCES "public"."audio_assets"("id") ON DELETE set null ON UPDATE no action;