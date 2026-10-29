# Local demo walkthrough

Screenshots were captured from the production build running against the seeded local database (`node scripts/demo-screenshots.mjs`).
Demo content is marked "(Demo)". Payments use the labelled development mock.

## Try it yourself

1. Start the stack (README > Run it locally) and open http://localhost:3000 on a phone-sized window.
2. **Guest:** browse the home page, search "phone", filter by category or region, switch the market to Ghana (prices change to GHS),
   then open a listing and a storefront.
3. **Buyer** (`buyer@naira.test` / `Password123!`): message a seller, make an offer, save items, follow a shop, report a listing.
4. **Seller** (`chioma@naira.test`): open Messages and counter or accept the offer; the buyer can then leave a review. Post a new listing
   with a photo; pause and reactivate it.
5. **Credits** (`tunde@naira.test`): Dashboard > Credits > Buy Starter > "Simulate successful payment". The balance rises by 50 only after
   the signed webhook. Then promote a listing on the homepage and open the homepage in a private window to see the "Sponsored" card.
   Impressions and clicks appear on the Promotions page.
6. **Admin** (`admin@naira.test`): /admin has stats, moderation, reports, users (suspend, adjust credits), verifications, countries,
   categories, policies, packages, campaigns, plans, payments and the audit log.
7. **Privacy:** Account > Download my data / Deactivate / Delete account.
8. **PWA:** install from the browser menu, then go offline. Visited public pages show a "saved copy" banner; other pages show the
   offline page.

## Screenshots

| | |
| --- | --- |
| ![Home](screenshots/01-home-mobile.jpg) Home (phone) | ![Search](screenshots/02-search-mobile.jpg) Search |
| ![Listing](screenshots/03-listing-mobile.jpg) Listing | ![Storefront](screenshots/04-storefront-mobile.jpg) Storefront |
| ![Pricing](screenshots/05-pricing-mobile.jpg) Pricing | ![Conversation](screenshots/06-conversation-offer-mobile.jpg) Negotiation |
| ![Dashboard](screenshots/07-seller-dashboard-mobile.jpg) Seller dashboard | ![New listing](screenshots/08-new-listing-mobile.jpg) New listing |
| ![Credits](screenshots/09-credits-mobile.jpg) Credits | ![Promotions](screenshots/10-promotions-mobile.jpg) Promotions |
| ![Offline copy](screenshots/16-offline-saved-copy-mobile.jpg) Offline saved copy | ![Offline](screenshots/17-offline-fallback-mobile.jpg) Offline fallback |

![Admin overview](screenshots/11-admin-overview-desktop.jpg)
![Admin payments](screenshots/12-admin-payments-desktop.jpg)
![Audit log](screenshots/13-admin-audit-desktop.jpg)
![Home desktop](screenshots/14-home-desktop.jpg)
![Home dark](screenshots/15-home-dark-desktop.jpg)
