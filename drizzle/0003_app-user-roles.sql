CREATE TYPE "public"."app_role" AS ENUM('ADMIN', 'OPERATOR');--> statement-breakpoint
CREATE TABLE "app_user_roles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"role" "app_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
