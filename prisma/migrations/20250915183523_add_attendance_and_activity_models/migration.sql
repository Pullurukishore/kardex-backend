-- CreateEnum
CREATE TYPE "public"."AttendanceStatus" AS ENUM ('CHECKED_IN', 'CHECKED_OUT', 'ABSENT', 'LATE', 'EARLY_CHECKOUT');

-- CreateEnum
CREATE TYPE "public"."ActivityType" AS ENUM ('TICKET_WORK', 'BD_VISIT', 'PO_DISCUSSION', 'SPARE_REPLACEMENT', 'TRAVEL', 'TRAINING', 'MEETING', 'MAINTENANCE', 'DOCUMENTATION', 'OTHER');

-- CreateTable
CREATE TABLE "public"."Attendance" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "checkInAt" TIMESTAMP(3) NOT NULL,
    "checkOutAt" TIMESTAMP(3),
    "checkInLatitude" DECIMAL(10,7),
    "checkInLongitude" DECIMAL(10,7),
    "checkInAddress" TEXT,
    "checkOutLatitude" DECIMAL(10,7),
    "checkOutLongitude" DECIMAL(10,7),
    "checkOutAddress" TEXT,
    "totalHours" DECIMAL(4,2),
    "status" "public"."AttendanceStatus" NOT NULL DEFAULT 'CHECKED_IN',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DailyActivityLog" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "ticketId" INTEGER,
    "activityType" "public"."ActivityType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3),
    "duration" INTEGER,
    "location" TEXT,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Attendance_userId_checkInAt_idx" ON "public"."Attendance"("userId", "checkInAt");

-- CreateIndex
CREATE INDEX "Attendance_status_idx" ON "public"."Attendance"("status");

-- CreateIndex
CREATE INDEX "DailyActivityLog_userId_startTime_idx" ON "public"."DailyActivityLog"("userId", "startTime");

-- CreateIndex
CREATE INDEX "DailyActivityLog_ticketId_idx" ON "public"."DailyActivityLog"("ticketId");

-- CreateIndex
CREATE INDEX "DailyActivityLog_activityType_idx" ON "public"."DailyActivityLog"("activityType");

-- AddForeignKey
ALTER TABLE "public"."Attendance" ADD CONSTRAINT "Attendance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DailyActivityLog" ADD CONSTRAINT "DailyActivityLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DailyActivityLog" ADD CONSTRAINT "DailyActivityLog_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "public"."Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
