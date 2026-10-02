# FASHSTRIDE

FASHSTRIDE is a Next.js App Router sneaker store starter built with TypeScript, Tailwind, Supabase/Postgres, Supabase Auth, Paystack and Mailgun. It includes a polished responsive storefront, Nike/Adidas sample catalogue, size-aware cart, wishlist, customer accounts, checkout, payment verification/webhook, order history and a role-protected admin area.

> **Before launch:** the UI works with sample catalogue data when Supabase is not configured. Checkout is deliberately unavailable until Supabase and Paystack credentials are configured. Set real store inventory before accepting any orders. Sample imagery and prices are placeholders and do not assert that FASHSTRIDE owns or stocks branded goods.

## Requirements and local setup

1. Install the current Node.js LTS release (npm is included). Restart your terminal after installation.
2. From the project folder, run `npm install`.
3. Create a Supabase project at [supabase.com](https://supabase.com), then open **Project Settings → API** and copy the Project URL, publishable/anon key, and service-role key.
4. Copy `.env.example` to `.env.local`. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`. Keep the service-role value private; never prefix it with `NEXT_PUBLIC_`.
5. In Supabase **SQL Editor**, run `supabase/migrations/202610020001_initial.sql`, then `supabase/migrations/202610020002_product_images.sql` for the public product image bucket and admin-only upload policies.
6. Run `npm run db:seed-test` to add four sample payment-test listings, their local sneaker photos in Supabase Storage, and EU sizes 39–44 with two test units each. This requires the Supabase URL and service-role key in `.env.local`. The sample descriptions say physical availability is unconfirmed. `npm run db:seed` is the larger development catalogue seed.
7. Run `npm run dev` and open [http://localhost:3000](http://localhost:3000).

The migration uses a security-definer SQL function to calculate amounts from database prices and reserve all sizes atomically. NGN values are stored as naira and USD values as dollars; Paystack receives the amount in its minor unit (kobo/cents). Stock stays reserved while payment is pending and is restored after a failed charge. Consider a scheduled expiry job for abandoned pending payments before production.

## Supabase Auth and Google

In **Authentication → URL Configuration**, set the local Site URL to `http://localhost:3000` and add `http://localhost:3000/auth/callback` to Redirect URLs. Enable email/password and configure email confirmation in **Authentication → Providers / Email**. Configure SMTP in Supabase if you want reliable confirmation and password-reset delivery.

For Google sign-in:

1. In Google Cloud Console, create a project and configure the OAuth consent screen/branding and authorized audience.
2. Create an OAuth client with type **Web application**.
3. In Supabase **Authentication → Providers → Google**, copy the callback URL displayed there into Google’s **Authorized redirect URIs**. It will look like `https://<project-ref>.supabase.co/auth/v1/callback`.
4. Paste the Google Client ID and Client Secret into the Supabase Google provider settings and enable the provider. The secret belongs in Supabase, never in frontend code. `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are listed in `.env.example` for reference only; this app delegates OAuth secret handling to Supabase.
5. Add `http://localhost:3000/auth/callback` to Supabase redirect URLs. For production, add `https://your-domain/auth/callback` and set the production Site URL.

## Safely make the first admin

Create and confirm an owner account normally, then use the Supabase SQL editor while logged in as the project owner:

```sql
update public.profiles set role = 'admin' where email = 'YOUR_OWNER_EMAIL';
```

Do not expose service-role credentials to the browser or permit customers to self-assign roles. The RLS policies authorize admin operations using the profile role. Only the project owner should run the promotion query.

## Paystack test payments

1. Create a Paystack account and use **test** keys while developing. Set `PAYSTACK_SECRET_KEY` to the test secret and `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` to the test public key (the server redirect flow currently requires only the secret).
2. Set `NEXT_PUBLIC_SITE_URL=http://localhost:3000`.
3. In Paystack dashboard, configure a webhook at `https://your-host/api/payments/webhook` (for local testing use a secure tunnel URL). Webhook signatures are checked using Paystack’s HMAC-SHA512 signature.
4. The checkout page requires an authenticated customer. Sign in, add a size-backed database product, and check out in NGN.
5. Paystack currency support depends on the merchant account and market. USD transactions are rejected unless the merchant has enabled USD settlement and `PAYSTACK_USD_ENABLED=true` is set. Confirm currency support with Paystack before enabling it.
6. Only after end-to-end test transactions and reconciliation, replace test keys with live keys in the Vercel Production environment. Keep test keys in Development/Preview.

Payment success is confirmed by calling Paystack’s verification endpoint and by validating webhook signatures. The database confirmation function checks the expected amount and currency and is idempotent. Do not use the callback URL alone as proof of payment.

## Mailgun order and contact email

Create a Mailgun account and verify a sending domain and its DNS records. Create a **Domain Sending Key** for least privilege and set it as `MAILGUN_API_KEY`; set the sending domain as `MAILGUN_DOMAIN` and a verified sender (for example `FASHSTRIDE <orders@your-domain>`) as `MAILGUN_FROM_EMAIL`. The server uses HTTP Basic Auth and multipart form data. US sending domains use `https://api.mailgun.net`; for an EU domain set `MAILGUN_API_BASE=https://api.eu.mailgun.net`. These settings are server-only. Add them to `.env.local`, restart Next.js, then use **Send test email** in `/admin`; the test goes to the signed-in admin email. Once verified, paid orders receive a branded confirmation email and the contact form forwards messages to `fasubastephen1@gmail.com`. Mailgun sandbox domains can send only to authorized recipients, so verify a sending domain before production.

## Supabase Storage and catalogue maintenance

Product images are stored locally under `public/images/sneakers/` with photographer/source details in `public/images/sneakers/attribution.json`; the payment-test seed copies the selected files into Supabase Storage and stores the public URLs in `products.images`. The Storage migration creates the public `product-images` bucket and limits uploads, updates, and deletes to admins. At `/admin/products`, an admin can add/edit products, upload multiple images, set both currency prices, add sizes and stock, feature listings, activate/deactivate products, and delete products. Deactivated drafts remain hidden from customers. Replace test/sample prices and stock with verified store inventory before accepting real orders.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (browser safe) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/publishable key (RLS protected) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only privileged database operations |
| `PAYSTACK_SECRET_KEY` | Server-only payment initialization and verification |
| `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` | Optional Paystack public key; not used by redirect checkout |
| `PAYSTACK_USD_ENABLED` | Set to `true` only after confirming merchant USD support |
| `MAILGUN_API_KEY` | Server-only Mailgun API credential |
| `MAILGUN_DOMAIN` | Verified Mailgun sending domain |
| `MAILGUN_API_BASE` | Mailgun region API base; US default `https://api.mailgun.net` or EU `https://api.eu.mailgun.net` |
| `MAILGUN_FROM_EMAIL` | Verified sender address |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Reference values; enter Google credentials in Supabase Auth instead |
| `NEXT_PUBLIC_SITE_URL` | Canonical URL and Paystack callback base |
| `SHIPPING_FEE_NGN`, `SHIPPING_FEE_USD` | Intended shipping configuration; shipping amounts come from `SHIPPING_FEE_NGN` and `SHIPPING_FEE_USD` on the server |

Never commit `.env.local` or secrets. Vercel variables are configured in **Project → Settings → Environment Variables**; add public URL/anon values for Preview and Production and server keys only to the appropriate server environments.

## Vercel deployment

1. Push this project to a GitHub repository and import it in Vercel.
2. Add environment variables in Vercel for Development, Preview and Production as needed. Do not add secrets to `NEXT_PUBLIC_*` variables.
3. Set `NEXT_PUBLIC_SITE_URL` to the deployed production URL. Update the Supabase Auth Site URL/redirect allowlist and Google OAuth redirect configuration with the production domain.
4. Set the Paystack production webhook to `https://your-domain/api/payments/webhook`. Keep test keys in Preview, live keys only in Production.
5. Deploy. Run database migrations through Supabase SQL Editor or your reviewed migration workflow; do not run a destructive schema reset against production.

## Current scope and provider-dependent work

Authentication, database-backed products/orders, and Paystack test checkout use the configured provider credentials. Transactional email still requires Mailgun credentials and a verified sending domain. Abandoned payment reservations still need an expiry job before production. Treat the seeded catalogue as test inventory until the store owner verifies actual stock.
