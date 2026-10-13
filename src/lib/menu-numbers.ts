// Numbers 1–58 from อาหารร้านนอก.xlsx, tied to the imported SKU so
// category filters, favorites, and display-order changes never renumber cards.
export function menuNumber(product: {sku: string}) {
 const match = /^SEED-OUTSIDE-(\d{3})$/.exec(product.sku);
 if (!match) return undefined;
 const number = Number(match[1]);
 return number >= 1 && number <= 58 ? number : undefined;
}
