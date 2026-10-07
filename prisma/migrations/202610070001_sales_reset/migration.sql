CREATE TABLE "SalesResetArchive" (
 "id" TEXT PRIMARY KEY,
 "userId" TEXT NOT NULL,
 "userName" TEXT NOT NULL,
 "reason" TEXT NOT NULL,
 "counts" JSONB NOT NULL,
 "payload" JSONB NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "RetiredCheckoutKey" (
 "key" TEXT PRIMARY KEY,
 "archiveId" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER sales_archive_immutable BEFORE UPDATE OR DELETE ON "SalesResetArchive" FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();
CREATE TRIGGER retired_checkout_immutable BEFORE UPDATE OR DELETE ON "RetiredCheckoutKey" FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();
