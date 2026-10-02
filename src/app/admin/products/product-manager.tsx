'use client';

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase-browser';

type Category = { id: string; name: string };
type SizeRow = { size: string; stock_quantity: number };
type ProductRow = {
  id: string; name: string; slug: string; brand: 'Nike' | 'Adidas'; description: string;
  category_id: string | null; price_ngn: number; price_usd: number;
  compare_at_price_ngn: number | null; compare_at_price_usd: number | null;
  images: string[] | null; featured: boolean; active: boolean; product_sizes: SizeRow[];
};
type Editor = {
  name: string; brand: 'Nike' | 'Adidas'; category_id: string; description: string;
  price_ngn: string; price_usd: string; compare_at_price_ngn: string; compare_at_price_usd: string;
  featured: boolean; active: boolean;
};
const emptyEditor: Editor = { name: '', brand: 'Nike', category_id: '', description: '', price_ngn: '', price_usd: '', compare_at_price_ngn: '', compare_at_price_usd: '', featured: false, active: false };
const bucket = 'product-images';
const toSlug = (value: string) => value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function ProductManager() {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [editor, setEditor] = useState<Editor>(emptyEditor);
  const [sizes, setSizes] = useState<SizeRow[]>([{ size: '40', stock_quantity: 0 }, { size: '41', stock_quantity: 0 }, { size: '42', stock_quantity: 0 }]);
  const [images, setImages] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function load() {
    const db = supabaseBrowser();
    if (!db) { setError('Supabase is not configured.'); return; }
    const [productResult, categoryResult] = await Promise.all([
      db.from('products').select('id,name,slug,brand,description,category_id,price_ngn,price_usd,compare_at_price_ngn,compare_at_price_usd,images,featured,active,product_sizes(size,stock_quantity)').order('created_at', { ascending: false }),
      db.from('categories').select('id,name').order('name')
    ]);
    if (productResult.error) setError(productResult.error.message);
    else setProducts((productResult.data || []) as ProductRow[]);
    if (categoryResult.error) setError(categoryResult.error.message);
    else setCategories(categoryResult.data || []);
  }

  useEffect(() => { void load(); }, []);
  const filePreviews = useMemo(() => files.map(file => ({ file, url: URL.createObjectURL(file) })), [files]);
  useEffect(() => () => filePreviews.forEach(item => URL.revokeObjectURL(item.url)), [filePreviews]);

  function resetForm() {
    setEditor({ ...emptyEditor, category_id: categories[0]?.id || '' });
    setSizes([{ size: '40', stock_quantity: 0 }, { size: '41', stock_quantity: 0 }, { size: '42', stock_quantity: 0 }]);
    setImages([]); setFiles([]); setEditingId(null); setError(''); setMessage('');
  }

  function editProduct(product: ProductRow) {
    setEditingId(product.id);
    setEditor({ name: product.name, brand: product.brand, category_id: product.category_id || '', description: product.description || '', price_ngn: String(product.price_ngn), price_usd: String(product.price_usd), compare_at_price_ngn: product.compare_at_price_ngn == null ? '' : String(product.compare_at_price_ngn), compare_at_price_usd: product.compare_at_price_usd == null ? '' : String(product.compare_at_price_usd), featured: product.featured, active: product.active });
    setSizes(product.product_sizes?.length ? product.product_sizes.map(item => ({ ...item })) : [{ size: '40', stock_quantity: 0 }]);
    setImages(product.images || []); setFiles([]); setError(''); setMessage('');
    document.getElementById('product-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function selectFiles(event: ChangeEvent<HTMLInputElement>) {
    const chosen = Array.from(event.target.files || []);
    const supportedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
    const invalid = chosen.find(file => !supportedTypes.includes(file.type) || file.size > 8 * 1024 * 1024);
    if (invalid) { setError('Choose JPG, PNG, WebP, or AVIF images no larger than 8 MB each.'); event.target.value = ''; return; }
    setFiles(current => [...current, ...chosen]); event.target.value = '';
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    const db = supabaseBrowser();
    if (!db) { setBusy(false); setError('Supabase is not configured.'); return; }
    const slug = toSlug(editor.name);
    const priceNgn = Number(editor.price_ngn), priceUsd = Number(editor.price_usd);
    const readyImages = images.length + files.length > 0;
    if (!slug || !editor.category_id) { setBusy(false); setError('Enter a product name and choose a category.'); return; }
    if (editor.active && (!readyImages || priceNgn <= 0 || priceUsd <= 0 || !sizes.some(row => row.size.trim() && Number(row.stock_quantity) > 0))) {
      setBusy(false); setError('An active listing needs an image, both prices, and at least one in-stock size.'); return;
    }
    if (sizes.some(row => !row.size.trim() || !Number.isInteger(Number(row.stock_quantity)) || Number(row.stock_quantity) < 0)) {
      setBusy(false); setError('Each size needs a label and a whole-number stock quantity of zero or more.'); return;
    }
    try {
      const uploaded: string[] = [];
      for (const file of files) {
        const extension = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
        const path = `${slug}/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await db.storage.from(bucket).upload(path, file, { cacheControl: '31536000', contentType: file.type, upsert: false });
        if (uploadError) throw new Error(uploadError.message.includes('Bucket not found') ? 'Product image storage is not set up. Apply the product-images Supabase migration first.' : uploadError.message);
        uploaded.push(db.storage.from(bucket).getPublicUrl(path).data.publicUrl);
      }
      const payload = {
        name: editor.name.trim(), slug, brand: editor.brand, category_id: editor.category_id,
        description: editor.description.trim(), price_ngn: priceNgn, price_usd: priceUsd,
        compare_at_price_ngn: editor.compare_at_price_ngn ? Number(editor.compare_at_price_ngn) : null,
        compare_at_price_usd: editor.compare_at_price_usd ? Number(editor.compare_at_price_usd) : null,
        images: [...images, ...uploaded], featured: editor.featured, active: editor.active, updated_at: new Date().toISOString()
      };
      let productId = editingId;
      if (editingId) {
        const { error: updateError } = await db.from('products').update(payload).eq('id', editingId);
        if (updateError) throw updateError;
      } else {
        const { data, error: insertError } = await db.from('products').insert(payload).select('id').single();
        if (insertError) throw insertError;
        productId = data.id;
      }
      const cleanSizes = sizes.map(row => ({ product_id: productId, size: row.size.trim(), stock_quantity: Number(row.stock_quantity) }));
      const { error: sizeError } = await db.from('product_sizes').upsert(cleanSizes, { onConflict: 'product_id,size' });
      if (sizeError) throw sizeError;
      const { data: existingSizes, error: readSizeError } = await db.from('product_sizes').select('size').eq('product_id', productId);
      if (readSizeError) throw readSizeError;
      const removed = (existingSizes || []).map(row => row.size).filter(size => !cleanSizes.some(row => row.size === size));
      if (removed.length) {
        const { error: deleteSizeError } = await db.from('product_sizes').delete().eq('product_id', productId).in('size', removed);
        if (deleteSizeError) throw deleteSizeError;
      }
      setFiles([]); setMessage(editingId ? 'Product updated.' : 'Product added.'); await load();
      setEditor({ ...emptyEditor, category_id: categories[0]?.id || '' }); setSizes([{ size: '40', stock_quantity: 0 }, { size: '41', stock_quantity: 0 }, { size: '42', stock_quantity: 0 }]); setImages([]); setEditingId(null);
    } catch (cause: any) {
      setError(cause?.message || 'Could not save the product.');
    } finally { setBusy(false); }
  }

  async function toggleProduct(product: ProductRow) {
    const db = supabaseBrowser(); if (!db) return;
    setBusy(true); setError('');
    const { error } = await db.from('products').update({ active: !product.active, updated_at: new Date().toISOString() }).eq('id', product.id);
    if (error) setError(error.message); else { setMessage(product.active ? 'Product deactivated.' : 'Product activated.'); await load(); }
    setBusy(false);
  }

  async function deleteProduct(product: ProductRow) {
    if (!window.confirm(`Delete ${product.name}? This can fail if it is in a customer's cart.`)) return;
    const db = supabaseBrowser(); if (!db) return;
    setBusy(true); setError('');
    const { error } = await db.from('products').delete().eq('id', product.id);
    if (error) setError(error.message); else { setMessage('Product deleted.'); if (editingId === product.id) resetForm(); await load(); }
    setBusy(false);
  }

  return <div className="wrap admin-page product-admin-page">
    <span className="eyebrow">CATALOGUE / SUPABASE STORAGE</span>
    <h1>Product management.</h1>
    <p className="muted">Create and edit your catalogue. Active listings must have photos, prices in NGN and USD, and stock in at least one size.</p>
    {message && <p className="form-message" role="status">{message}</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <form id="product-editor" className="product-editor" onSubmit={save}>
      <div className="admin-head"><h2>{editingId ? 'Edit product' : 'Add a product'}</h2>{editingId && <button className="plain-button" type="button" onClick={resetForm}>Cancel edit</button>}</div>
      <div className="product-editor-grid">
        <label>Product name<input value={editor.name} onChange={e => setEditor({ ...editor, name: e.target.value })} required maxLength={120} placeholder="e.g. Nike Air Max 270" /></label>
        <label>Brand<select value={editor.brand} onChange={e => setEditor({ ...editor, brand: e.target.value as Editor['brand'] })}><option>Nike</option><option>Adidas</option></select></label>
        <label>Category<select value={editor.category_id} onChange={e => setEditor({ ...editor, category_id: e.target.value })} required><option value="">Choose category</option>{categories.map(category => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label>
        <label>Price (NGN)<input type="number" min="1" step="1" value={editor.price_ngn} onChange={e => setEditor({ ...editor, price_ngn: e.target.value })} required /></label>
        <label>Price (USD)<input type="number" min="1" step="0.01" value={editor.price_usd} onChange={e => setEditor({ ...editor, price_usd: e.target.value })} required /></label>
        <label>Compare at (NGN)<input type="number" min="0" step="1" value={editor.compare_at_price_ngn} onChange={e => setEditor({ ...editor, compare_at_price_ngn: e.target.value })} /></label>
        <label>Compare at (USD)<input type="number" min="0" step="0.01" value={editor.compare_at_price_usd} onChange={e => setEditor({ ...editor, compare_at_price_usd: e.target.value })} /></label>
        <label className="product-description-field">Description<textarea rows={4} value={editor.description} onChange={e => setEditor({ ...editor, description: e.target.value })} maxLength={3000} /></label>
      </div>
      <div className="product-admin-section"><h3>Product images</h3><p className="muted">Select multiple JPG, PNG, WebP, or AVIF files (8 MB max each). Images are uploaded to Supabase Storage.</p><label className="image-upload">Choose images<input type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple onChange={selectFiles} /></label>
        {(images.length > 0 || filePreviews.length > 0) && <div className="admin-image-grid">{images.map((url, index) => <div className="admin-image-tile" key={url}><img src={url} alt={`Product image ${index + 1}`} /><button type="button" onClick={() => setImages(current => current.filter((_, i) => i !== index))} aria-label="Remove image">×</button></div>)}{filePreviews.map(({ file, url }) => <div className="admin-image-tile" key={`${file.name}-${file.lastModified}`}><img src={url} alt={file.name} /><button type="button" onClick={() => setFiles(current => current.filter(item => item !== file))} aria-label={`Remove ${file.name}`}>×</button></div>)}</div>}
      </div>
      <div className="product-admin-section"><div className="admin-head"><h3>Sizes and stock</h3><button className="plain-button" type="button" onClick={() => setSizes(current => [...current, { size: '', stock_quantity: 0 }])}>+ Add size</button></div>
        <div className="size-stock-list">{sizes.map((row, index) => <div className="size-stock-row" key={index}><label>Size<input value={row.size} onChange={e => setSizes(current => current.map((item, i) => i === index ? { ...item, size: e.target.value } : item))} placeholder="EU 42" required /></label><label>Quantity<input type="number" min="0" step="1" value={row.stock_quantity} onChange={e => setSizes(current => current.map((item, i) => i === index ? { ...item, stock_quantity: Number(e.target.value) } : item))} required /></label><button type="button" className="remove-size" onClick={() => setSizes(current => current.filter((_, i) => i !== index))} aria-label={`Remove size ${row.size}`}>Remove</button></div>)}</div>
      </div>
      <div className="product-flags"><label><input type="checkbox" checked={editor.featured} onChange={e => setEditor({ ...editor, featured: e.target.checked })} /> Feature on the homepage</label><label><input type="checkbox" checked={editor.active} onChange={e => setEditor({ ...editor, active: e.target.checked })} /> Active and visible to customers</label></div>
      <button className="pill lime" disabled={busy}>{busy ? 'Saving…' : editingId ? 'Save product changes' : 'Add product'}</button>
    </form>
    <section className="product-list-section"><div className="admin-head"><h2>Catalogue</h2><span>{products.length} products</span></div>
      {products.length ? <div className="admin-product-list">{products.map(product => <article className="admin-product-card" key={product.id}><div className="admin-product-photo">{product.images?.[0] && <img src={product.images[0]} alt="" />}</div><div className="admin-product-info"><b>{product.name}</b><span>{product.brand} · {product.active ? 'Active' : 'Inactive'}</span><span>₦{Number(product.price_ngn).toLocaleString()} · ${Number(product.price_usd).toFixed(2)}</span><span>{(product.product_sizes || []).map(row => `EU ${row.size}: ${row.stock_quantity}`).join(' · ') || 'No sizes yet'}</span></div><div className="admin-product-actions"><button className="pill outline" type="button" onClick={() => editProduct(product)}>Edit</button><button className="plain-button" type="button" disabled={busy} onClick={() => void toggleProduct(product)}>{product.active ? 'Deactivate' : 'Activate'}</button><button className="plain-button danger-text" type="button" disabled={busy} onClick={() => void deleteProduct(product)}>Delete</button></div></article>)}</div> : <p className="empty-admin-list">No products yet. Add your first product above.</p>}
    </section>
  </div>;
}
