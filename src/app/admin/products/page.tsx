import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase-server';
import { ProductManager } from './product-manager';

export const dynamic = 'force-dynamic';

export default async function AdminProductsPage() {
  try {
    const supabase = supabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect('/account');
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
    if (profile?.role !== 'admin') redirect('/');
    return <ProductManager />;
  } catch (error: any) {
    if (error?.digest?.startsWith('NEXT_REDIRECT')) throw error;
    return <div className="wrap empty-state"><h1>Product management is unavailable.</h1><p>Check the Supabase setup, then reload this page.</p></div>;
  }
}
