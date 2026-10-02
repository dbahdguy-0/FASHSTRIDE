import { createClient } from '@supabase/supabase-js';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

for (const line of readFileSync(resolve(process.cwd(), '.env.local'), 'utf8').split(/\r?\n/)) {
  const entry = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (!entry || process.env[entry[1]] !== undefined) continue;
  const value = entry[2].replace(/^(['"])(.*)\1$/, '$2');
  process.env[entry[1]] = value;
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.');
const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const bucket = 'product-images';

const listings = [
  { name: 'Nike Air Max 270', brand: 'Nike', category: 'Lifestyle', slug: 'nike-air-max-270', ngn: 68000, usd: 125, images: ['nike-air-jordan-01.jpg','nike-air-jordan-03.jpg','nike-air-jordan-06.jpg'] },
  { name: 'Nike Air Force 1 ’07', brand: 'Nike', category: 'Lifestyle', slug: 'nike-air-force-1-07', ngn: 72000, usd: 135, images: ['nike-air-jordan-04.jpg','nike-air-jordan-08.jpg','nike-air-jordan-11.jpg'] },
  { name: 'Nike Air Jordan 1 Retro High', brand: 'Nike', category: 'Basketball', slug: 'nike-air-jordan-1-retro-high', ngn: 150000, usd: 250, images: ['nike-air-jordan-05.jpg','nike-air-jordan-10.jpg','nike-air-jordan-12.jpg'] },
  { name: 'Adidas Samba OG', brand: 'Adidas', category: 'Lifestyle', slug: 'adidas-samba-og', ngn: 89000, usd: 165, images: ['adidas-sneaker-01.jpg','adidas-sneaker-05.jpg','adidas-sneaker-08.jpg'] }
];

async function main() {
  const { data: existingBucket } = await db.storage.getBucket(bucket);
  const bucketResult = existingBucket
    ? await db.storage.updateBucket(bucket, { public: true, fileSizeLimit: 8388608, allowedMimeTypes: ['image/jpeg','image/png','image/webp','image/avif'] })
    : await db.storage.createBucket(bucket, { public: true, fileSizeLimit: 8388608, allowedMimeTypes: ['image/jpeg','image/png','image/webp','image/avif'] });
  if (bucketResult.error && !/already exists/i.test(bucketResult.error.message)) throw bucketResult.error;

  const categories = ['Lifestyle','Running','Basketball'];
  for (const name of categories) {
    const { error } = await db.from('categories').upsert({ name, slug: name.toLowerCase(), description: `${name} footwear` }, { onConflict: 'slug' });
    if (error) throw error;
  }
  const { data: categoryRows, error: categoryError } = await db.from('categories').select('id,slug');
  if (categoryError) throw categoryError;

  for (const listing of listings) {
    const category = categoryRows?.find(row => row.slug === listing.category.toLowerCase());
    if (!category) throw new Error(`Could not find the ${listing.category} category.`);
    const urls: string[] = [];
    for (const filename of listing.images) {
      const path = `payment-test/${listing.slug}/${filename}`;
      const bytes = await readFile(resolve(process.cwd(), 'public/images/sneakers', filename));
      const { error: uploadError } = await db.storage.from(bucket).upload(path, bytes, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: true });
      if (uploadError) throw uploadError;
      urls.push(db.storage.from(bucket).getPublicUrl(path).data.publicUrl);
    }
    const { data: product, error: productError } = await db.from('products').upsert({
      name: listing.name,
      slug: listing.slug,
      brand: listing.brand,
      description: 'FASHSTRIDE sample listing prepared for Paystack test-mode checkout. Test inventory only; physical availability has not been confirmed.',
      category_id: category.id,
      price_ngn: listing.ngn,
      price_usd: listing.usd,
      images: urls,
      featured: true,
      active: true
    }, { onConflict: 'slug' }).select('id').single();
    if (productError) throw productError;
    const sizes = ['39','40','41','42','43','44'].map(size => ({ product_id: product.id, size, stock_quantity: 2 }));
    const { error: sizeError } = await db.from('product_sizes').upsert(sizes, { onConflict: 'product_id,size' });
    if (sizeError) throw sizeError;
  }
  const { data: check, error: checkError } = await db.from('products')
    .select('name,slug,images,product_sizes(size,stock_quantity)')
    .in('slug', listings.map(item => item.slug));
  if (checkError) throw checkError;
  console.log(`Verified ${check?.length || 0}/${listings.length} test listings in Supabase with photos and sizes.`);
  for (const item of check || []) console.log(`${item.name}: ${item.images?.length || 0} images, ${item.product_sizes?.length || 0} sizes`);
  console.log('Each test size has stock 2. Paystack test keys are required for checkout.');
}

main().catch(error => { console.error(error?.message || 'Could not seed payment test inventory.'); process.exitCode = 1; });
