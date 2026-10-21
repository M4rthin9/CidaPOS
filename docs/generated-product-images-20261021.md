# Generated product photographs — 21 October 2026

Added 24 product photographs for the active catalogue entries that had no image: 20 outside-shop drinks and four ice creams. Existing product images, names, prices and account assignments are preserved.

The photographs were generated with the built-in `image_gen` tool and reviewed as a complete contact sheet. These are illustrative menu images, including generic unlabelled bottles for branded beverages. The final prompt set, product mapping and WebP checksums are in [the generation manifest](menu-image-prompts-missing-20261021.json). The approved WebP files are in `public/menu-images/` at 768 × 768 pixels. Original generated PNG files are retained locally in `.wrangler/generated-product-images/`.

To prepare the WebP assets again from the original PNG files:

```sh
node scripts/prepare-missing-product-images.mjs
```

Preview attachment to the live catalogue:

```sh
node --import tsx scripts/attach-generated-product-images.ts --remote --check
```

Attach and verify the images:

```sh
node --import tsx scripts/attach-generated-product-images.ts --remote
```

The attachment command verifies product names and image checksums, uploads to R2, backs up previous image values locally, and updates only active products whose image is empty or already matches this generated image. It preserves custom images and records changes in the audit log. Repeated runs are idempotent. Remote access uses the existing local Cloudflare configuration; no credentials are included in the manifest or assets.

Live verification after attachment: 24 images attached and verified, no active products missing images, and all 122 previously populated image fields preserved. Six archived test products with empty image fields were excluded.
