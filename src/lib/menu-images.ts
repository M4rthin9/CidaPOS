import images from './menu-images.json';

const menuImages: Record<string, string> = images;

export function menuImage(product: {sku: string; image: string}) {
 return product.image || menuImages[product.sku] || '';
}
