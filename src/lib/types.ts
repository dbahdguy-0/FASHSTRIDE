export type Currency = 'NGN' | 'USD';
export type Product = { id: string; name: string; slug: string; brand: 'Nike'|'Adidas'; category: string; description: string; price_ngn: number; price_usd: number; compare_at_price_ngn?: number; compare_at_price_usd?: number; images: string[]; featured: boolean; active: boolean; sizes: { size: string; stock_quantity: number }[] };
export type CartLine = { productId: string; size: string; quantity: number };
