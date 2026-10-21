-- Supplied outside-shop drinks. Existing product edits and sales remain intact.
INSERT INTO "Category" ("id","name","icon","color","sort")
SELECT 'menu-outside-drinks','เครื่องดื่มร้านค้านอก (ต้นขาม)','Coffee','#4d86a6',40
WHERE NOT EXISTS (SELECT 1 FROM "Category" WHERE "id"='menu-outside-drinks' OR "name"='เครื่องดื่มร้านค้านอก (ต้นขาม)');

WITH drinks(n,name,price) AS (VALUES
 (1,'OISHI',2000),
 (2,'น้ำ',1000),
 (3,'เอส',2000),
 (4,'แคนตาลูปโซดา',2500),
 (5,'แอปเปิ้ลเขียวโซดา',2500),
 (6,'ส้มโซดา',2500),
 (7,'เสาวรสโซดา',2500),
 (8,'บลูเบอร์รี่โซดา',2500),
 (9,'สตรอว์เบอร์รี่โซดา',2500),
 (10,'บ๊วยโซดา',2500),
 (11,'เขียวโซดา',2500),
 (12,'แดงโซดา',2500),
 (13,'ชานม',2500),
 (14,'นมเย็น',2500),
 (15,'ชามะนาว',2500),
 (16,'โกโก้',2500),
 (17,'โอวัลตินเย็น',2500),
 (18,'โอวัลตินร้อน',1200),
 (19,'กาแฟเย็น',2500),
 (20,'กาแฟร้อน',1200)
)
INSERT INTO "Product" ("id","sku","name","price","categoryId","sort","updatedAt")
SELECT 'outside-drink-'||printf('%03d',n),'OUTSIDE-DRINK-'||printf('%03d',n),name,price,
(SELECT "id" FROM "Category" WHERE "id"='menu-outside-drinks' OR "name"='เครื่องดื่มร้านค้านอก (ต้นขาม)' ORDER BY ("id"='menu-outside-drinks') DESC LIMIT 1),n,CAST(strftime('%s','now') AS INTEGER)*1000
FROM drinks
WHERE NOT EXISTS (SELECT 1 FROM "Product" AS p WHERE p."sku"='OUTSIDE-DRINK-'||printf('%03d',drinks.n) OR (p."name"=drinks.name AND p."categoryId"=(SELECT "id" FROM "Category" WHERE "id"='menu-outside-drinks' OR "name"='เครื่องดื่มร้านค้านอก (ต้นขาม)' ORDER BY ("id"='menu-outside-drinks') DESC LIMIT 1)));
