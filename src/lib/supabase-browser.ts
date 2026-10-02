'use client';
import {createBrowserClient} from '@supabase/ssr';import {SupabaseClient} from '@supabase/supabase-js';let client:SupabaseClient|null=null;export function supabaseBrowser(){const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;if(!url||!key)return null;if(!client)client=createBrowserClient(url,key);return client}
