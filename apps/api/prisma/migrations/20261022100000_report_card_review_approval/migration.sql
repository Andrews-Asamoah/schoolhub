ALTER TABLE "report_card_sets"
ADD COLUMN "isReviewed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "reviewedAt" TIMESTAMP(3);
