-- Correct the old iMin USB default to the SDK's built-in SPI connection.
-- CodeSoft remains available through an explicit device/fallback selection.
-- Preserve printer IDs, capabilities, and explicitly selected other adapters.
UPDATE "Terminal"
SET "config" = json_set("config", '$.connection', 'SPI', '$.fallbackPrinter', 'browser')
WHERE json_extract("config", '$.adapter') = 'imin'
  AND json_extract("config", '$.connection') = 'USB';
