Menu photographs are generated with the built-in image_gen tool. The shared art direction and every dish prompt are recorded in menu-image-prompts.json.

Final assets live in public/menu-images as 768 × 768 WebP images. src/lib/menu-images.json maps each menu SKU to its image. POS and catalog screens use these photographs when a product has no uploaded image. Uploaded product images take priority.

To save the photographs as actual product attachments, run `npx tsx scripts/attach-menu-images.ts` locally or append `--remote` for the live catalog. Add `--check` to inspect matching records without changes. The script matches SKU and menu name, preserves custom images, backs up previous image fields, uploads to R2, verifies SHA-256 checksums, and updates product image fields with authenticated media URLs in one audited transaction. Re-running it reuses the same generated image objects. New seed records also include their corresponding bundled photographs.

Run `node scripts/optimize-menu-images.mjs` after adding generated PNGs named after their lowercase menu SKU. It converts PNGs to WebP and rebuilds the manifest from assets present on disk. Original full-resolution generations are retained under the user's Codex generated_images directory.

The menu item SEED-OUTSIDE-058, อาหารพิเศษฝ่ายฝึก(ส่งวันเสาร์), does not specify a dish. Its photograph needs the actual meal contents before generation.
