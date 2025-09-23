-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "public"."OnsiteVisitEvent" ADD VALUE 'WORK_STARTED';
ALTER TYPE "public"."OnsiteVisitEvent" ADD VALUE 'WORK_PAUSED';
ALTER TYPE "public"."OnsiteVisitEvent" ADD VALUE 'WORK_RESUMED';
ALTER TYPE "public"."OnsiteVisitEvent" ADD VALUE 'WORK_COMPLETED';
ALTER TYPE "public"."OnsiteVisitEvent" ADD VALUE 'RESOLVED';
ALTER TYPE "public"."OnsiteVisitEvent" ADD VALUE 'PENDING';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "public"."TicketStatus" ADD VALUE 'ONSITE_VISIT_STARTED';
ALTER TYPE "public"."TicketStatus" ADD VALUE 'ONSITE_VISIT_REACHED';
ALTER TYPE "public"."TicketStatus" ADD VALUE 'ONSITE_VISIT_IN_PROGRESS';
ALTER TYPE "public"."TicketStatus" ADD VALUE 'ONSITE_VISIT_RESOLVED';
ALTER TYPE "public"."TicketStatus" ADD VALUE 'ONSITE_VISIT_PENDING';
ALTER TYPE "public"."TicketStatus" ADD VALUE 'ONSITE_VISIT_COMPLETED';
ALTER TYPE "public"."TicketStatus" ADD VALUE 'PO_REACHED';

-- AlterTable
ALTER TABLE "public"."Ticket" ADD COLUMN     "onsiteEndLocation" TEXT,
ADD COLUMN     "onsiteLocationHistory" TEXT,
ADD COLUMN     "onsiteStartLocation" TEXT,
ADD COLUMN     "poReachedAt" TIMESTAMP(3),
ADD COLUMN     "visitInProgressAt" TIMESTAMP(3),
ADD COLUMN     "visitReachedAt" TIMESTAMP(3),
ADD COLUMN     "visitResolvedAt" TIMESTAMP(3),
ADD COLUMN     "visitStartedAt" TIMESTAMP(3);
