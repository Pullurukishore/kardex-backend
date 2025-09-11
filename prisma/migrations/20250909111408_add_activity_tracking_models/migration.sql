-- CreateEnum
CREATE TYPE "public"."ActivityType" AS ENUM ('WORK_START', 'WORK_END', 'BREAK_START', 'BREAK_END', 'LUNCH_START', 'LUNCH_END', 'TRAVEL_START', 'TRAVEL_END', 'WFH_START', 'WFH_END', 'TICKET_START', 'TICKET_END', 'TICKET_UPDATE', 'TICKET_ESCALATION', 'TICKET_RESOLUTION', 'TICKET_REOPEN', 'TICKET_NOTE', 'TICKET_ASSIGNMENT', 'TICKET_TRANSFER');

-- CreateEnum
CREATE TYPE "public"."ActivityStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'PAUSED', 'CANCELLED');

-- CreateTable
CREATE TABLE "public"."UserActivity" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalWorkTime" INTEGER DEFAULT 0,
    "totalBreakTime" INTEGER DEFAULT 0,
    "totalTravelTime" INTEGER DEFAULT 0,
    "totalWFHTime" INTEGER DEFAULT 0,
    "status" "public"."ActivityStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "lastActivityAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ActivityLog" (
    "id" SERIAL NOT NULL,
    "userActivityId" INTEGER NOT NULL,
    "activityType" "public"."ActivityType" NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endTime" TIMESTAMP(3),
    "duration" INTEGER,
    "status" "public"."ActivityStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "notes" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "location" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" INTEGER NOT NULL,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TicketTimeLog" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "userActivityId" INTEGER NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endTime" TIMESTAMP(3),
    "duration" INTEGER,
    "activityType" "public"."ActivityType" NOT NULL,
    "status" "public"."ActivityStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "description" TEXT,
    "isBillable" BOOLEAN NOT NULL DEFAULT true,
    "travelTime" INTEGER DEFAULT 0,
    "travelDistance" DOUBLE PRECISION,
    "location" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" INTEGER NOT NULL,

    CONSTRAINT "TicketTimeLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserActivity_userId_idx" ON "public"."UserActivity"("userId");

-- CreateIndex
CREATE INDEX "UserActivity_date_idx" ON "public"."UserActivity"("date");

-- CreateIndex
CREATE INDEX "UserActivity_status_idx" ON "public"."UserActivity"("status");

-- CreateIndex
CREATE UNIQUE INDEX "UserActivity_userId_date_key" ON "public"."UserActivity"("userId", "date");

-- CreateIndex
CREATE INDEX "ActivityLog_userActivityId_idx" ON "public"."ActivityLog"("userActivityId");

-- CreateIndex
CREATE INDEX "ActivityLog_activityType_idx" ON "public"."ActivityLog"("activityType");

-- CreateIndex
CREATE INDEX "ActivityLog_startTime_idx" ON "public"."ActivityLog"("startTime");

-- CreateIndex
CREATE INDEX "ActivityLog_status_idx" ON "public"."ActivityLog"("status");

-- CreateIndex
CREATE INDEX "ActivityLog_userId_idx" ON "public"."ActivityLog"("userId");

-- CreateIndex
CREATE INDEX "TicketTimeLog_ticketId_idx" ON "public"."TicketTimeLog"("ticketId");

-- CreateIndex
CREATE INDEX "TicketTimeLog_userActivityId_idx" ON "public"."TicketTimeLog"("userActivityId");

-- CreateIndex
CREATE INDEX "TicketTimeLog_startTime_idx" ON "public"."TicketTimeLog"("startTime");

-- CreateIndex
CREATE INDEX "TicketTimeLog_status_idx" ON "public"."TicketTimeLog"("status");

-- CreateIndex
CREATE INDEX "TicketTimeLog_activityType_idx" ON "public"."TicketTimeLog"("activityType");

-- CreateIndex
CREATE INDEX "TicketTimeLog_userId_idx" ON "public"."TicketTimeLog"("userId");

-- AddForeignKey
ALTER TABLE "public"."UserActivity" ADD CONSTRAINT "UserActivity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ActivityLog" ADD CONSTRAINT "ActivityLog_userActivityId_fkey" FOREIGN KEY ("userActivityId") REFERENCES "public"."UserActivity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ActivityLog" ADD CONSTRAINT "ActivityLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TicketTimeLog" ADD CONSTRAINT "TicketTimeLog_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "public"."Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TicketTimeLog" ADD CONSTRAINT "TicketTimeLog_userActivityId_fkey" FOREIGN KEY ("userActivityId") REFERENCES "public"."UserActivity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TicketTimeLog" ADD CONSTRAINT "TicketTimeLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
