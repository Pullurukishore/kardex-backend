-- CreateTable
CREATE TABLE "public"."Rating" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "customerId" INTEGER NOT NULL,
    "rating" SMALLINT NOT NULL,
    "feedback" TEXT,
    "customerPhone" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rating_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Rating_ticketId_key" ON "public"."Rating"("ticketId");

-- CreateIndex
CREATE INDEX "Rating_customerId_idx" ON "public"."Rating"("customerId");

-- CreateIndex
CREATE INDEX "Rating_rating_idx" ON "public"."Rating"("rating");

-- CreateIndex
CREATE INDEX "Rating_createdAt_idx" ON "public"."Rating"("createdAt");

-- AddForeignKey
ALTER TABLE "public"."Rating" ADD CONSTRAINT "Rating_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "public"."Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Rating" ADD CONSTRAINT "Rating_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
