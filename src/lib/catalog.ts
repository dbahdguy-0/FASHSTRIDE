import { Product } from './types';

const nikeImages = [
  '/images/sneakers/nike-air-jordan-01.jpg', '/images/sneakers/nike-air-jordan-02.jpg',
  '/images/sneakers/nike-air-jordan-03.jpg', '/images/sneakers/nike-air-jordan-04.jpg',
  '/images/sneakers/nike-air-jordan-05.jpg', '/images/sneakers/nike-air-jordan-06.jpg',
  '/images/sneakers/nike-air-jordan-07.jpg', '/images/sneakers/nike-air-jordan-08.jpg',
  '/images/sneakers/nike-air-jordan-09.jpg', '/images/sneakers/nike-air-jordan-10.jpg',
  '/images/sneakers/nike-air-jordan-11.jpg', '/images/sneakers/nike-air-jordan-12.jpg'
];
const adidasImages = [
  '/images/sneakers/adidas-sneaker-01.jpg', '/images/sneakers/adidas-sneaker-02.jpg',
  '/images/sneakers/adidas-sneaker-03.jpg', '/images/sneakers/adidas-sneaker-04.jpg',
  '/images/sneakers/adidas-sneaker-05.jpg', '/images/sneakers/adidas-sneaker-06.jpg',
  '/images/sneakers/adidas-sneaker-07.jpg', '/images/sneakers/adidas-sneaker-08.jpg'
];

const names = [
  ['Nike Air Max 270','Nike','Lifestyle',68000,125],['Nike Air Force 1 ’07','Nike','Lifestyle',72000,135],
  ['Nike Dunk Low Retro','Nike','Basketball',85000,155],['Nike Pegasus 41','Nike','Running',98000,180],
  ['Nike Revolution 7','Nike','Running',52000,95],['Nike Blazer Mid ’77','Nike','Lifestyle',79000,145],
  ['Nike Vomero 17','Nike','Running',118000,215],['Nike Air Max Pulse','Nike','Lifestyle',105000,195],
  ['Adidas Samba OG','Adidas','Lifestyle',89000,165],['Adidas Superstar','Adidas','Lifestyle',78000,145],
  ['Adidas Ultraboost Light','Adidas','Running',145000,265],['Adidas Gazelle Indoor','Adidas','Lifestyle',92000,170],
  ['Adidas Campus 00s','Adidas','Lifestyle',96000,178],['Adidas Forum Low','Adidas','Basketball',84000,155],
  ['Adidas Duramo SL','Adidas','Running',57000,105],['Adidas Adizero Boston 12','Adidas','Running',130000,240]
] as const;

const photoIndex = { Nike: 0, Adidas: 0 };
export const products: Product[] = names.map(([name,brand,category,ngn,usd], i) => {
  const gallery = brand === 'Nike' ? nikeImages : adidasImages;
  const first = photoIndex[brand]++;
  return {
    id: `sample-${i+1}`,
    name,
    slug: name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/-$/,''),
    brand,
    category,
    description: `A considered everyday pair from ${brand}, selected for comfort, confident lines and all-day wear. Explore the ${name} at FASHSTRIDE.`,
    price_ngn: ngn,
    price_usd: usd,
    ...(i === 2 || i === 8 ? { compare_at_price_ngn: ngn+18000, compare_at_price_usd: usd+30 } : {}),
    images: [gallery[first % gallery.length], gallery[(first + 2) % gallery.length], gallery[(first + 4) % gallery.length]],
    featured: i < 6,
    active: true,
    sizes: ['39','40','41','42','43','44','45'].map((size,j) => ({ size, stock_quantity: ((i+j)%5===0 ? 0 : 2 + ((i*3+j)%8)) }))
  };
});

// Keep sample photos visible for storefront previews, but never imply that
// sample items are purchasable or physically in stock.
export const previewProducts = products.map(product => ({
  ...product,
  sizes: product.sizes.map(size => ({ ...size, stock_quantity: 0 }))
}));

export async function getProducts(): Promise<Product[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return previewProducts;
  try {
    const response = await fetch(`${url}/rest/v1/products?select=*,categories(name),product_sizes(size,stock_quantity)&active=eq.true&order=created_at.desc`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      cache: 'no-store'
    });
    if (!response.ok) return previewProducts;
    const rows = await response.json();
    if (!rows.length) return previewProducts;
    return rows.map((product: any) => {
      const sample = products.find(item => item.slug === product.slug);
      const images = Array.isArray(product.images) && product.images.length
        ? product.images
        : sample?.images ?? (product.brand === 'Adidas' ? adidasImages : nikeImages).slice(0, 3);
      return { ...product, images, category: product.categories?.name ?? 'Lifestyle', sizes: product.product_sizes ?? [] };
    });
  } catch {
    return previewProducts;
  }
}
