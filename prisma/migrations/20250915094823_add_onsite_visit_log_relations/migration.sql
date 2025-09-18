-- CreateEnum
CREATE TYPE "public"."OnsiteVisitEvent" AS ENUM ('STARTED', 'REACHED', 'ENDED');

-- CreateTable
CREATE TABLE "public"."OnsiteVisitLog" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "event" "public"."OnsiteVisitEvent" NOT NULL,
    "latitude" DECIMAL(10,7) NOT NULL,
    "longitude" DECIMAL(10,7) NOT NULL,
    "address" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OnsiteVisitLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OnsiteVisitLog_ticketId_event_createdAt_idx" ON "public"."OnsiteVisitLog"("ticketId", "event", "createdAt");

-- CreateIndex
CREATE INDEX "OnsiteVisitLog_userId_createdAt_idx" ON "public"."OnsiteVisitLog"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "public"."OnsiteVisitLog" ADD CONSTRAINT "OnsiteVisitLog_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "public"."Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OnsiteVisitLog" ADD CONSTRAINT "OnsiteVisitLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
