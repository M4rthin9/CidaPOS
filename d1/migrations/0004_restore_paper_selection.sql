-- Undo the automatic 80 mm conversion. Paper size is an operator choice.
UPDATE "Setting"
SET "value" = json_set("value", '$.profile.paperMm', '58', '$.profile.width', 384, '$.profile.characters', 32)
WHERE "key" = 'system'
  AND json_extract("value", '$.profile.paperMm') = '80'
  AND json_extract("value", '$.profile.width') = 576
  AND json_extract("value", '$.profile.characters') = 48;
