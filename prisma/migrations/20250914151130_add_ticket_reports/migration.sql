-- CreateTable
CREATE TABLE "public"."TicketReport" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "fileType" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "uploadedById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TicketReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TicketReport_ticketId_idx" ON "public"."TicketReport"("ticketId");

-- CreateIndex
CREATE INDEX "TicketReport_uploadedById_idx" ON "public"."TicketReport"("uploadedById");

-- CreateIndex
CREATE INDEX "TicketReport_createdAt_idx" ON "public"."TicketReport"("createdAt");

-- AddForeignKey
ALTER TABLE "public"."TicketReport" ADD CONSTRAINT "TicketReport_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "public"."Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TicketReport" ADD CONSTRAINT "TicketReport_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
