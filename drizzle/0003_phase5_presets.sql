CREATE TABLE "preset_imports" (
	"user_id" text NOT NULL,
	"preset_island_id" text NOT NULL,
	"island_id" text,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "preset_imports_user_id_preset_island_id_pk" PRIMARY KEY("user_id","preset_island_id")
);
--> statement-breakpoint
CREATE TABLE "preset_islands" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"emoji" text,
	"description" text,
	"level" text,
	"source_lang" text DEFAULT 'en' NOT NULL,
	"target_lang" text DEFAULT 'ro' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"origin" text DEFAULT 'seed' NOT NULL,
	"prompt_version" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "preset_sentences" (
	"id" text PRIMARY KEY NOT NULL,
	"preset_island_id" text NOT NULL,
	"source_text" text NOT NULL,
	"target_text" text NOT NULL,
	"translation_note" text,
	"lemmas" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"audio_asset_id" text,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "islands" ADD COLUMN "imported_from_preset_id" text;--> statement-breakpoint
ALTER TABLE "islands" ADD COLUMN "origin" text DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "sentences" ADD COLUMN "preset_sentence_id" text;--> statement-breakpoint
ALTER TABLE "usage_monthly" ADD COLUMN "islands_generated" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "preset_imports" ADD CONSTRAINT "preset_imports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preset_imports" ADD CONSTRAINT "preset_imports_preset_island_id_preset_islands_id_fk" FOREIGN KEY ("preset_island_id") REFERENCES "public"."preset_islands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preset_imports" ADD CONSTRAINT "preset_imports_island_id_islands_id_fk" FOREIGN KEY ("island_id") REFERENCES "public"."islands"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preset_islands" ADD CONSTRAINT "preset_islands_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preset_sentences" ADD CONSTRAINT "preset_sentences_preset_island_id_preset_islands_id_fk" FOREIGN KEY ("preset_island_id") REFERENCES "public"."preset_islands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preset_sentences" ADD CONSTRAINT "preset_sentences_audio_asset_id_audio_assets_id_fk" FOREIGN KEY ("audio_asset_id") REFERENCES "public"."audio_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "preset_islands_published_idx" ON "preset_islands" USING btree ("published","position");--> statement-breakpoint
CREATE INDEX "preset_sentences_island_position_idx" ON "preset_sentences" USING btree ("preset_island_id","position");