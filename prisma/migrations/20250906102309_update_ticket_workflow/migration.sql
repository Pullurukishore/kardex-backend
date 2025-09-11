/*
  Warnings:

  - The values [CUSTOMER_OWNER] on the enum `UserRole` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `summary` on the `Ticket` table. All the data in the column will be lost.
  - You are about to drop the column `comments` on the `TicketStatusHistory` table. All the data in the column will be lost.
  - Added the required column `zoneId` to the `Ticket` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "public"."TicketStatus" ADD VALUE 'PO_NEEDED';
ALTER TYPE "public"."TicketStatus" ADD VALUE 'PO_RECEIVED';
ALTER TYPE "public"."TicketStatus" ADD VALUE 'CANCELLED';
ALTER TYPE "public"."TicketStatus" ADD VALUE 'REOPENED';

-- AlterEnum
BEGIN;
CREATE TYPE "public"."UserRole_new" AS ENUM ('ADMIN', 'ZONE_USER', 'SERVICE_PERSON');
ALTER TABLE "public"."User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "public"."User" ALTER COLUMN "role" TYPE "public"."UserRole_new" USING ("role"::text::"public"."UserRole_new");
ALTER TYPE "public"."UserRole" RENAME TO "UserRole_old";
ALTER TYPE "public"."UserRole_new" RENAME TO "UserRole";
DROP TYPE "public"."UserRole_old";
ALTER TABLE "public"."User" ALTER COLUMN "role" SET DEFAULT 'ZONE_USER';
COMMIT;

-- DropForeignKey
ALTER TABLE "public"."TicketStatusHistory" DROP CONSTRAINT "TicketStatusHistory_ticketId_fkey";

-- AlterTable
ALTER TABLE "public"."Ticket" DROP COLUMN "summary",
ADD COLUMN     "actualResolutionTime" INTEGER,
ADD COLUMN     "dueDate" TIMESTAMP(3),
ADD COLUMN     "errorDetails" TEXT,
ADD COLUMN     "escalatedAt" TIMESTAMP(3),
ADD COLUMN     "escalatedBy" INTEGER,
ADD COLUMN     "escalatedReason" TEXT,
ADD COLUMN     "estimatedResolutionTime" INTEGER,
ADD COLUMN     "isCritical" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isEscalated" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastStatusChange" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "poApprovedAt" TIMESTAMP(3),
ADD COLUMN     "poApprovedById" INTEGER,
ADD COLUMN     "poNumber" TEXT,
ADD COLUMN     "proofImages" TEXT,
ADD COLUMN     "relatedMachineIds" TEXT,
ADD COLUMN     "resolutionSummary" TEXT,
ADD COLUMN     "sparePartsDetails" TEXT,
ADD COLUMN     "timeInStatus" INTEGER,
ADD COLUMN     "totalTimeOpen" INTEGER,
ADD COLUMN     "visitCompletedDate" TIMESTAMP(3),
ADD COLUMN     "visitPlannedDate" TIMESTAMP(3),
ADD COLUMN     "zoneId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "public"."TicketStatusHistory" DROP COLUMN "comments",
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "timeInStatus" INTEGER,
ADD COLUMN     "totalTimeOpen" INTEGER;

-- CreateIndex
CREATE INDEX "TicketStatusHistory_status_idx" ON "public"."TicketStatusHistory"("status");

-- AddForeignKey
ALTER TABLE "public"."Ticket" ADD CONSTRAINT "Ticket_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "public"."ServiceZone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TicketStatusHistory" ADD CONSTRAINT "TicketStatusHistory_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "public"."Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
