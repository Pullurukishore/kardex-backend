/*
  Warnings:

  - You are about to drop the column `approvedAt` on the `PurchaseOrder` table. All the data in the column will be lost.
  - You are about to drop the column `cancellationReason` on the `PurchaseOrder` table. All the data in the column will be lost.
  - You are about to drop the column `cancelledAt` on the `PurchaseOrder` table. All the data in the column will be lost.
  - You are about to drop the column `orderedAt` on the `PurchaseOrder` table. All the data in the column will be lost.
  - You are about to drop the column `receivedAt` on the `PurchaseOrder` table. All the data in the column will be lost.
  - You are about to drop the column `totalPrice` on the `PurchaseOrderItem` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[poNumber]` on the table `PurchaseOrder` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `total` to the `PurchaseOrderItem` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "public"."Asset_serialNo_key";

-- AlterTable
ALTER TABLE "public"."Asset" ADD COLUMN     "amcStart" TIMESTAMP(3),
ADD COLUMN     "warrantyStart" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "public"."PurchaseOrder" DROP COLUMN "approvedAt",
DROP COLUMN "cancellationReason",
DROP COLUMN "cancelledAt",
DROP COLUMN "orderedAt",
DROP COLUMN "receivedAt",
ALTER COLUMN "status" SET DEFAULT 'PENDING_APPROVAL';

-- AlterTable
ALTER TABLE "public"."PurchaseOrderItem" DROP COLUMN "totalPrice",
ADD COLUMN     "total" DOUBLE PRECISION NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_poNumber_key" ON "public"."PurchaseOrder"("poNumber");

-- CreateIndex
CREATE INDEX "PurchaseOrder_ticketId_idx" ON "public"."PurchaseOrder"("ticketId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_createdById_idx" ON "public"."PurchaseOrder"("createdById");

-- CreateIndex
CREATE INDEX "PurchaseOrder_approvedById_idx" ON "public"."PurchaseOrder"("approvedById");

-- CreateIndex
CREATE INDEX "PurchaseOrder_cancelledById_idx" ON "public"."PurchaseOrder"("cancelledById");

-- CreateIndex
CREATE INDEX "PurchaseOrderItem_purchaseOrderId_idx" ON "public"."PurchaseOrderItem"("purchaseOrderId");
