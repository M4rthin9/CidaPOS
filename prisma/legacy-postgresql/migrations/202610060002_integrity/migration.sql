ALTER TABLE "BusinessDay" ADD COLUMN "config" JSONB NOT NULL DEFAULT '{}';
UPDATE "BusinessDay" SET "config" = (SELECT "value" FROM "Setting" WHERE "key" = 'system') WHERE EXISTS (SELECT 1 FROM "Setting" WHERE "key" = 'system');
ALTER TABLE "Product" ADD CONSTRAINT product_money CHECK (price >= 0 AND cost >= 0);
ALTER TABLE "Modifier" ADD CONSTRAINT modifier_money CHECK (price >= 0);
ALTER TABLE "Order" ADD CONSTRAINT order_money CHECK (subtotal >= 0 AND discount >= 0 AND total = subtotal - discount AND refunded BETWEEN 0 AND total);
ALTER TABLE "OrderItem" ADD CONSTRAINT item_money CHECK ("unitPrice" >= 0 AND quantity > 0 AND discount >= 0 AND "lineTotal" = "unitPrice" * quantity - discount AND refunded BETWEEN 0 AND "lineTotal");
ALTER TABLE "Payment" ADD CONSTRAINT payment_money CHECK (amount >= 0 AND received >= amount AND change = received - amount);
ALTER TABLE "Adjustment" ADD CONSTRAINT adjustment_money CHECK (amount >= 0);
CREATE FUNCTION reject_immutable_change() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'Immutable financial/audit record cannot be changed'; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER audit_immutable BEFORE UPDATE OR DELETE ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();
CREATE TRIGGER snapshot_immutable BEFORE UPDATE OR DELETE ON "SalesSnapshot" FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();
CREATE TRIGGER closing_immutable BEFORE UPDATE OR DELETE ON "DailyClosing" FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();
CREATE TRIGGER payment_immutable BEFORE UPDATE OR DELETE ON "Payment" FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();
CREATE TRIGGER adjustment_immutable BEFORE UPDATE OR DELETE ON "Adjustment" FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();
CREATE TRIGGER order_no_delete BEFORE DELETE ON "Order" FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();
CREATE TRIGGER item_no_delete BEFORE DELETE ON "OrderItem" FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();
CREATE FUNCTION protect_order_snapshot() RETURNS trigger AS $$ BEGIN
 IF (to_jsonb(OLD) - 'status' - 'refunded') IS DISTINCT FROM (to_jsonb(NEW) - 'status' - 'refunded') THEN RAISE EXCEPTION 'Order snapshot cannot be edited'; END IF;
 RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER order_snapshot BEFORE UPDATE ON "Order" FOR EACH ROW EXECUTE FUNCTION protect_order_snapshot();
CREATE FUNCTION protect_item_snapshot() RETURNS trigger AS $$ BEGIN
 IF (to_jsonb(OLD) - 'refunded') IS DISTINCT FROM (to_jsonb(NEW) - 'refunded') THEN RAISE EXCEPTION 'Item snapshot cannot be edited'; END IF;
 RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER item_snapshot BEFORE UPDATE ON "OrderItem" FOR EACH ROW EXECUTE FUNCTION protect_item_snapshot();
