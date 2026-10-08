-- Correct the installed default profile for this shop's 80 mm receipt printer.
-- Keep customized widths and the historical bill/day snapshots intact.
UPDATE "Setting"
SET "value" = json_set("value", '$.profile.paperMm', '80', '$.profile.width', 576, '$.profile.characters', 48)
WHERE "key" = 'system'
  AND json_extract("value", '$.profile.paperMm') = '58'
  AND json_extract("value", '$.profile.width') = 384;
