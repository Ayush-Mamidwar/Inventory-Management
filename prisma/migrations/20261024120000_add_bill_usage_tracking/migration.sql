ALTER TABLE "StockUsage"
ADD COLUMN "billItemId" UUID;

CREATE INDEX "StockUsage_billItemId_idx"
ON "StockUsage"("billItemId");

ALTER TABLE "StockUsage"
ADD CONSTRAINT "StockUsage_billItemId_fkey"
FOREIGN KEY ("billItemId") REFERENCES "BillItem"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
