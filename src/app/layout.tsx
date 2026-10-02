import type { Metadata } from 'next';
import './globals.css';import './design.css';import './avatar.css';import './currency.css';import './mailgun.css';import './admin-products.css';
import { StoreProvider } from '@/components/store-provider';
import { Header } from '@/components/header';
import { Footer } from '@/components/footer';
export const metadata: Metadata = { title: { default: 'FASHSTRIDE — Move with intention', template: '%s | FASHSTRIDE' }, description: 'A curated sneaker destination for everyday movement. Discover Nike and Adidas at FASHSTRIDE.', openGraph: { title:'FASHSTRIDE', description:'Move with intention.', type:'website' } };
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="en" suppressHydrationWarning><body><StoreProvider><Header/><main>{children}</main><Footer/></StoreProvider></body></html> }
