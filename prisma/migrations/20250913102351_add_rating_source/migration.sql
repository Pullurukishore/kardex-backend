-- AlterTable
ALTER TABLE "public"."Rating" ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'WEB';

-- CreateIndex
CREATE INDEX "Rating_source_idx" ON "public"."Rating"("source");
