CREATE TABLE _PosRevision (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL DEFAULT 0);

INSERT INTO _PosRevision(id,revision) VALUES(1,0);

CREATE TABLE _PosCommit (id TEXT PRIMARY KEY, expectedRevision INTEGER NOT NULL, purpose TEXT NOT NULL, archiveId TEXT);

CREATE TRIGGER pos_revision_guard BEFORE INSERT ON _PosCommit WHEN NEW.expectedRevision != (SELECT revision FROM _PosRevision WHERE id=1) BEGIN SELECT RAISE(ABORT,'POS_CONFLICT'); END;

CREATE TRIGGER pos_revision_advance AFTER INSERT ON _PosCommit BEGIN UPDATE _PosRevision SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER AuditLog_immutable_update BEFORE UPDATE ON "AuditLog" BEGIN SELECT RAISE(ABORT,'Immutable financial/audit record cannot be changed'); END;

CREATE TRIGGER AuditLog_immutable_delete BEFORE DELETE ON "AuditLog"  BEGIN SELECT RAISE(ABORT,'Immutable financial/audit record cannot be changed'); END;

CREATE TRIGGER SalesSnapshot_immutable_update BEFORE UPDATE ON "SalesSnapshot" BEGIN SELECT RAISE(ABORT,'Immutable financial/audit record cannot be changed'); END;

CREATE TRIGGER SalesSnapshot_immutable_delete BEFORE DELETE ON "SalesSnapshot" WHEN NOT EXISTS (SELECT 1 FROM _PosCommit c JOIN SalesResetArchive a ON a.id=c.archiveId WHERE c.purpose='SALES_RESET' AND json_extract(a.payload,'$.storage')='r2') BEGIN SELECT RAISE(ABORT,'Immutable financial/audit record cannot be changed'); END;

CREATE TRIGGER DailyClosing_immutable_update BEFORE UPDATE ON "DailyClosing" BEGIN SELECT RAISE(ABORT,'Immutable financial/audit record cannot be changed'); END;

CREATE TRIGGER DailyClosing_immutable_delete BEFORE DELETE ON "DailyClosing" WHEN NOT EXISTS (SELECT 1 FROM _PosCommit c JOIN SalesResetArchive a ON a.id=c.archiveId WHERE c.purpose='SALES_RESET' AND json_extract(a.payload,'$.storage')='r2') BEGIN SELECT RAISE(ABORT,'Immutable financial/audit record cannot be changed'); END;

CREATE TRIGGER Payment_immutable_update BEFORE UPDATE ON "Payment" BEGIN SELECT RAISE(ABORT,'Immutable financial/audit record cannot be changed'); END;

CREATE TRIGGER Payment_immutable_delete BEFORE DELETE ON "Payment" WHEN NOT EXISTS (SELECT 1 FROM _PosCommit c JOIN SalesResetArchive a ON a.id=c.archiveId WHERE c.purpose='SALES_RESET' AND json_extract(a.payload,'$.storage')='r2') BEGIN SELECT RAISE(ABORT,'Immutable financial/audit record cannot be changed'); END;

CREATE TRIGGER Adjustment_immutable_update BEFORE UPDATE ON "Adjustment" BEGIN SELECT RAISE(ABORT,'Immutable financial/audit record cannot be changed'); END;

CREATE TRIGGER Adjustment_immutable_delete BEFORE DELETE ON "Adjustment" WHEN NOT EXISTS (SELECT 1 FROM _PosCommit c JOIN SalesResetArchive a ON a.id=c.archiveId WHERE c.purpose='SALES_RESET' AND json_extract(a.payload,'$.storage')='r2') BEGIN SELECT RAISE(ABORT,'Immutable financial/audit record cannot be changed'); END;

CREATE TRIGGER SalesResetArchive_immutable_update BEFORE UPDATE ON "SalesResetArchive" BEGIN SELECT RAISE(ABORT,'Immutable financial/audit record cannot be changed'); END;

CREATE TRIGGER SalesResetArchive_immutable_delete BEFORE DELETE ON "SalesResetArchive"  BEGIN SELECT RAISE(ABORT,'Immutable financial/audit record cannot be changed'); END;

CREATE TRIGGER RetiredCheckoutKey_immutable_update BEFORE UPDATE ON "RetiredCheckoutKey" BEGIN SELECT RAISE(ABORT,'Immutable financial/audit record cannot be changed'); END;

CREATE TRIGGER RetiredCheckoutKey_immutable_delete BEFORE DELETE ON "RetiredCheckoutKey"  BEGIN SELECT RAISE(ABORT,'Immutable financial/audit record cannot be changed'); END;

CREATE TRIGGER Order_no_delete BEFORE DELETE ON "Order" WHEN NOT EXISTS (SELECT 1 FROM _PosCommit c JOIN SalesResetArchive a ON a.id=c.archiveId WHERE c.purpose='SALES_RESET' AND json_extract(a.payload,'$.storage')='r2') BEGIN SELECT RAISE(ABORT,'Immutable financial/audit record cannot be changed'); END;

CREATE TRIGGER Order_snapshot BEFORE UPDATE ON "Order" WHEN OLD."id" IS NOT NEW."id" OR OLD."key" IS NOT NEW."key" OR OLD."requestHash" IS NOT NEW."requestHash" OR OLD."number" IS NOT NEW."number" OR OLD."queue" IS NOT NEW."queue" OR OLD."businessDate" IS NOT NEW."businessDate" OR OLD."cashierId" IS NOT NEW."cashierId" OR OLD."terminalId" IS NOT NEW."terminalId" OR OLD."subtotal" IS NOT NEW."subtotal" OR OLD."discount" IS NOT NEW."discount" OR OLD."total" IS NOT NEW."total" OR OLD."note" IS NOT NEW."note" OR OLD."receiptConfig" IS NOT NEW."receiptConfig" OR OLD."createdAt" IS NOT NEW."createdAt" BEGIN SELECT RAISE(ABORT,'Order snapshot cannot be edited'); END;

CREATE TRIGGER OrderItem_no_delete BEFORE DELETE ON "OrderItem" WHEN NOT EXISTS (SELECT 1 FROM _PosCommit c JOIN SalesResetArchive a ON a.id=c.archiveId WHERE c.purpose='SALES_RESET' AND json_extract(a.payload,'$.storage')='r2') BEGIN SELECT RAISE(ABORT,'Immutable financial/audit record cannot be changed'); END;

CREATE TRIGGER OrderItem_snapshot BEFORE UPDATE ON "OrderItem" WHEN OLD."id" IS NOT NEW."id" OR OLD."orderId" IS NOT NEW."orderId" OR OLD."productId" IS NOT NEW."productId" OR OLD."name" IS NOT NEW."name" OR OLD."categoryId" IS NOT NEW."categoryId" OR OLD."categoryName" IS NOT NEW."categoryName" OR OLD."unitPrice" IS NOT NEW."unitPrice" OR OLD."quantity" IS NOT NEW."quantity" OR OLD."discount" IS NOT NEW."discount" OR OLD."lineTotal" IS NOT NEW."lineTotal" OR OLD."modifiers" IS NOT NEW."modifiers" OR OLD."note" IS NOT NEW."note" BEGIN SELECT RAISE(ABORT,'OrderItem snapshot cannot be edited'); END;

CREATE TRIGGER Product_money_insert BEFORE INSERT ON "Product" WHEN NOT (NEW.price>=0 AND NEW.cost>=0) BEGIN SELECT RAISE(ABORT,'Invalid money values'); END;

CREATE TRIGGER Product_money_update BEFORE UPDATE ON "Product" WHEN NOT (NEW.price>=0 AND NEW.cost>=0) BEGIN SELECT RAISE(ABORT,'Invalid money values'); END;

CREATE TRIGGER Modifier_money_insert BEFORE INSERT ON "Modifier" WHEN NOT (NEW.price>=0) BEGIN SELECT RAISE(ABORT,'Invalid money values'); END;

CREATE TRIGGER Modifier_money_update BEFORE UPDATE ON "Modifier" WHEN NOT (NEW.price>=0) BEGIN SELECT RAISE(ABORT,'Invalid money values'); END;

CREATE TRIGGER Order_money_insert BEFORE INSERT ON "Order" WHEN NOT (NEW.subtotal>=0 AND NEW.discount>=0 AND NEW.total=NEW.subtotal-NEW.discount AND NEW.refunded BETWEEN 0 AND NEW.total) BEGIN SELECT RAISE(ABORT,'Invalid money values'); END;

CREATE TRIGGER Order_money_update BEFORE UPDATE ON "Order" WHEN NOT (NEW.subtotal>=0 AND NEW.discount>=0 AND NEW.total=NEW.subtotal-NEW.discount AND NEW.refunded BETWEEN 0 AND NEW.total) BEGIN SELECT RAISE(ABORT,'Invalid money values'); END;

CREATE TRIGGER OrderItem_money_insert BEFORE INSERT ON "OrderItem" WHEN NOT (NEW.unitPrice>=0 AND NEW.quantity>0 AND NEW.discount>=0 AND NEW.lineTotal=NEW.unitPrice*NEW.quantity-NEW.discount AND NEW.refunded BETWEEN 0 AND NEW.lineTotal) BEGIN SELECT RAISE(ABORT,'Invalid money values'); END;

CREATE TRIGGER OrderItem_money_update BEFORE UPDATE ON "OrderItem" WHEN NOT (NEW.unitPrice>=0 AND NEW.quantity>0 AND NEW.discount>=0 AND NEW.lineTotal=NEW.unitPrice*NEW.quantity-NEW.discount AND NEW.refunded BETWEEN 0 AND NEW.lineTotal) BEGIN SELECT RAISE(ABORT,'Invalid money values'); END;

CREATE TRIGGER Payment_money_insert BEFORE INSERT ON "Payment" WHEN NOT (NEW.amount>=0 AND NEW.received>=NEW.amount AND NEW.change=NEW.received-NEW.amount) BEGIN SELECT RAISE(ABORT,'Invalid money values'); END;

CREATE TRIGGER Payment_money_update BEFORE UPDATE ON "Payment" WHEN NOT (NEW.amount>=0 AND NEW.received>=NEW.amount AND NEW.change=NEW.received-NEW.amount) BEGIN SELECT RAISE(ABORT,'Invalid money values'); END;

CREATE TRIGGER Adjustment_money_insert BEFORE INSERT ON "Adjustment" WHEN NOT (NEW.amount>=0) BEGIN SELECT RAISE(ABORT,'Invalid money values'); END;

CREATE TRIGGER Adjustment_money_update BEFORE UPDATE ON "Adjustment" WHEN NOT (NEW.amount>=0) BEGIN SELECT RAISE(ABORT,'Invalid money values'); END;

CREATE TRIGGER User_revision_insert AFTER INSERT ON "User" WHEN NOT EXISTS (SELECT 1 FROM _PosCommit) BEGIN UPDATE _PosRevision SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER User_revision_update AFTER UPDATE ON "User" WHEN NOT EXISTS (SELECT 1 FROM _PosCommit) BEGIN UPDATE _PosRevision SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER User_revision_delete AFTER DELETE ON "User" WHEN NOT EXISTS (SELECT 1 FROM _PosCommit) BEGIN UPDATE _PosRevision SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER Session_revision_insert AFTER INSERT ON "Session" WHEN NOT EXISTS (SELECT 1 FROM _PosCommit) BEGIN UPDATE _PosRevision SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER Session_revision_update AFTER UPDATE ON "Session" WHEN NOT EXISTS (SELECT 1 FROM _PosCommit) BEGIN UPDATE _PosRevision SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER Session_revision_delete AFTER DELETE ON "Session" WHEN NOT EXISTS (SELECT 1 FROM _PosCommit) BEGIN UPDATE _PosRevision SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER LoginAttempt_revision_insert AFTER INSERT ON "LoginAttempt" WHEN NOT EXISTS (SELECT 1 FROM _PosCommit) BEGIN UPDATE _PosRevision SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER LoginAttempt_revision_update AFTER UPDATE ON "LoginAttempt" WHEN NOT EXISTS (SELECT 1 FROM _PosCommit) BEGIN UPDATE _PosRevision SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER LoginAttempt_revision_delete AFTER DELETE ON "LoginAttempt" WHEN NOT EXISTS (SELECT 1 FROM _PosCommit) BEGIN UPDATE _PosRevision SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER Category_revision_insert AFTER INSERT ON "Category" WHEN NOT EXISTS (SELECT 1 FROM _PosCommit) BEGIN UPDATE _PosRevision SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER Category_revision_update AFTER UPDATE ON "Category" WHEN NOT EXISTS (SELECT 1 FROM _PosCommit) BEGIN UPDATE _PosRevision SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER Category_revision_delete AFTER DELETE ON "Category" WHEN NOT EXISTS (SELECT 1 FROM _PosCommit) BEGIN UPDATE _PosRevision SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER Product_revision_insert AFTER INSERT ON "Product" WHEN NOT EXISTS (SELECT 1 FROM _PosCommit) BEGIN UPDATE _PosRevision SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER Product_revision_update AFTER UPDATE ON "Product" WHEN NOT EXISTS (SELECT 1 FROM _PosCommit) BEGIN UPDATE _PosRevision SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER Product_revision_delete AFTER DELETE ON "Product" WHEN NOT EXISTS (SELECT 1 FROM _PosCommit) BEGIN UPDATE _PosRevision SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER Modifier_revision_insert AFTER INSERT ON "Modifier" WHEN NOT EXISTS (SELECT 1 FROM _PosCommit) BEGIN UPDATE _PosRevision SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER Modifier_revision_update AFTER UPDATE ON "Modifier" WHEN NOT EXISTS (SELECT 1 FROM _PosCommit) BEGIN UPDATE _PosRevision SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER Modifier_revision_delete AFTER DELETE ON "Modifier" WHEN NOT EXISTS (SELECT 1 FROM _PosCommit) BEGIN UPDATE _PosRevision SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER Terminal_revision_insert AFTER INSERT ON "Terminal" WHEN NOT EXISTS (SELECT 1 FROM _PosCommit) BEGIN UPDATE _PosRevision SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER Terminal_revision_update AFTER UPDATE ON "Terminal" WHEN NOT EXISTS (SELECT 1 FROM _PosCommit) BEGIN UPDATE _PosRevision SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER Terminal_revision_delete AFTER DELETE ON "Terminal" WHEN NOT EXISTS (SELECT 1 FROM _PosCommit) BEGIN UPDATE _PosRevision SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER BusinessDay_revision_insert AFTER INSERT ON "BusinessDay" WHEN NOT EXISTS (SELECT 1 FROM _PosCommit) BEGIN UPDATE _PosRevision SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER BusinessDay_revision_update AFTER UPDATE ON "BusinessDay" WHEN NOT EXISTS (SELECT 1 FROM _PosCommit) BEGIN UPDATE _PosRevision SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER BusinessDay_revision_delete AFTER DELETE ON "BusinessDay" WHEN NOT EXISTS (SELECT 1 FROM _PosCommit) BEGIN UPDATE _PosRevision SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER Order_revision_insert AFTER INSERT ON "Order" WHEN NOT EXISTS (SELECT 1 FROM _PosCommit) BEGIN UPDATE _PosRevision SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER Order_revision_update AFTER UPDATE ON "Order" WHEN NOT EXISTS (SELECT 1 FROM _PosCommit) BEGIN UPDATE _PosRevision SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER Order_revision_delete AFTER DELETE ON "Order" WHEN NOT EXISTS (SELECT 1 FROM _PosCommit) BEGIN UPDATE _PosRevision SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER OrderItem_revision_insert AFTER INSERT ON "OrderItem" WHEN NOT EXISTS (SELECT 1 FROM _PosCommit) BEGIN UPDATE _PosRevision SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER OrderItem_revision_update AFTER UPDATE ON "OrderItem" WHEN NOT EXISTS (SELECT 1 FROM _PosCommit) BEGIN UPDATE _PosRevision SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER OrderItem_revision_delete AFTER DELETE ON "OrderItem" WHEN NOT EXISTS (SELECT 1 FROM _PosCommit) BEGIN UPDATE _PosRevision SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER Payment_revision_insert AFTER INSERT ON "Payment" WHEN NOT EXISTS (SELECT 1 FROM _PosCommit) BEGIN UPDATE _PosRevision SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER Payment_revision_update AFTER UPDATE ON "Payment" WHEN NOT EXISTS (SELECT 1 FROM _PosCommit) BEGIN UPDATE _PosRevision SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER Payment_revision_delete AFTER DELETE ON "Payment" WHEN NOT EXISTS (SELECT 1 FROM _PosCommit) BEGIN UPDATE _PosRevision SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER Adjustment_revision_insert AFTER INSERT ON "Adjustment" WHEN NOT EXISTS (SELECT 1 FROM _PosCommit) BEGIN UPDATE _PosRevision SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER Adjustment_revision_update AFTER UPDATE ON "Adjustment" WHEN NOT EXISTS (SELECT 1 FROM _PosCommit) BEGIN UPDATE _PosRevision SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER Adjustment_revision_delete AFTER DELETE ON "Adjustment" WHEN NOT EXISTS (SELECT 1 FROM _PosCommit) BEGIN UPDATE _PosRevision SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER ParkedOrder_revision_insert AFTER INSERT ON "ParkedOrder" WHEN NOT EXISTS (SELECT 1 FROM _PosCommit) BEGIN UPDATE _PosRevision SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER ParkedOrder_revision_update AFTER UPDATE ON "ParkedOrder" WHEN NOT EXISTS (SELECT 1 FROM _PosCommit) BEGIN UPDATE _PosRevision SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER ParkedOrder_revision_delete AFTER DELETE ON "ParkedOrder" WHEN NOT EXISTS (SELECT 1 FROM _PosCommit) BEGIN UPDATE _PosRevision SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER PrintJob_revision_insert AFTER INSERT ON "PrintJob" WHEN NOT EXISTS (SELECT 1 FROM _PosCommit) BEGIN UPDATE _PosRevision SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER PrintJob_revision_update AFTER UPDATE ON "PrintJob" WHEN NOT EXISTS (SELECT 1 FROM _PosCommit) BEGIN UPDATE _PosRevision SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER PrintJob_revision_delete AFTER DELETE ON "PrintJob" WHEN NOT EXISTS (SELECT 1 FROM _PosCommit) BEGIN UPDATE _PosRevision SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER PrinterRoute_revision_insert AFTER INSERT ON "PrinterRoute" WHEN NOT EXISTS (SELECT 1 FROM _PosCommit) BEGIN UPDATE _PosRevision SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER PrinterRoute_revision_update AFTER UPDATE ON "PrinterRoute" WHEN NOT EXISTS (SELECT 1 FROM _PosCommit) BEGIN UPDATE _PosRevision SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER PrinterRoute_revision_delete AFTER DELETE ON "PrinterRoute" WHEN NOT EXISTS (SELECT 1 FROM _PosCommit) BEGIN UPDATE _PosRevision SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER SalesSnapshot_revision_insert AFTER INSERT ON "SalesSnapshot" WHEN NOT EXISTS (SELECT 1 FROM _PosCommit) BEGIN UPDATE _PosRevision SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER SalesSnapshot_revision_update AFTER UPDATE ON "SalesSnapshot" WHEN NOT EXISTS (SELECT 1 FROM _PosCommit) BEGIN UPDATE _PosRevision SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER SalesSnapshot_revision_delete AFTER DELETE ON "SalesSnapshot" WHEN NOT EXISTS (SELECT 1 FROM _PosCommit) BEGIN UPDATE _PosRevision SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER DailyClosing_revision_insert AFTER INSERT ON "DailyClosing" WHEN NOT EXISTS (SELECT 1 FROM _PosCommit) BEGIN UPDATE _PosRevision SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER DailyClosing_revision_update AFTER UPDATE ON "DailyClosing" WHEN NOT EXISTS (SELECT 1 FROM _PosCommit) BEGIN UPDATE _PosRevision SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER DailyClosing_revision_delete AFTER DELETE ON "DailyClosing" WHEN NOT EXISTS (SELECT 1 FROM _PosCommit) BEGIN UPDATE _PosRevision SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER AuditLog_revision_insert AFTER INSERT ON "AuditLog" WHEN NOT EXISTS (SELECT 1 FROM _PosCommit) BEGIN UPDATE _PosRevision SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER AuditLog_revision_update AFTER UPDATE ON "AuditLog" WHEN NOT EXISTS (SELECT 1 FROM _PosCommit) BEGIN UPDATE _PosRevision SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER AuditLog_revision_delete AFTER DELETE ON "AuditLog" WHEN NOT EXISTS (SELECT 1 FROM _PosCommit) BEGIN UPDATE _PosRevision SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER Setting_revision_insert AFTER INSERT ON "Setting" WHEN NOT EXISTS (SELECT 1 FROM _PosCommit) BEGIN UPDATE _PosRevision SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER Setting_revision_update AFTER UPDATE ON "Setting" WHEN NOT EXISTS (SELECT 1 FROM _PosCommit) BEGIN UPDATE _PosRevision SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER Setting_revision_delete AFTER DELETE ON "Setting" WHEN NOT EXISTS (SELECT 1 FROM _PosCommit) BEGIN UPDATE _PosRevision SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER SalesResetArchive_revision_insert AFTER INSERT ON "SalesResetArchive" WHEN NOT EXISTS (SELECT 1 FROM _PosCommit) BEGIN UPDATE _PosRevision SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER SalesResetArchive_revision_update AFTER UPDATE ON "SalesResetArchive" WHEN NOT EXISTS (SELECT 1 FROM _PosCommit) BEGIN UPDATE _PosRevision SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER SalesResetArchive_revision_delete AFTER DELETE ON "SalesResetArchive" WHEN NOT EXISTS (SELECT 1 FROM _PosCommit) BEGIN UPDATE _PosRevision SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER RetiredCheckoutKey_revision_insert AFTER INSERT ON "RetiredCheckoutKey" WHEN NOT EXISTS (SELECT 1 FROM _PosCommit) BEGIN UPDATE _PosRevision SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER RetiredCheckoutKey_revision_update AFTER UPDATE ON "RetiredCheckoutKey" WHEN NOT EXISTS (SELECT 1 FROM _PosCommit) BEGIN UPDATE _PosRevision SET revision=revision+1 WHERE id=1; END;

CREATE TRIGGER RetiredCheckoutKey_revision_delete AFTER DELETE ON "RetiredCheckoutKey" WHEN NOT EXISTS (SELECT 1 FROM _PosCommit) BEGIN UPDATE _PosRevision SET revision=revision+1 WHERE id=1; END;
