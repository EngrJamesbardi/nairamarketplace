# Privacy and compliance notes

These notes describe what the software does. They are **not legal advice**. The legal pages in the app are marked as drafts, and a
qualified lawyer in each market must review them before launch.

Relevant laws include:

- **Nigeria:** Nigeria Data Protection Act 2023 (NDPC); also the FCCPA for consumer protection
- **Ghana:** Data Protection Act 2012 (registration with the Data Protection Commission)
- **Kenya:** Data Protection Act 2019 (ODPC registration)
- **South Africa:** POPIA (Information Regulator); also the ECT Act and CPA

## Personal data map

| Data | Where | Who can see it | Retention |
| --- | --- | --- | --- |
| Email, password hash | Supabase Auth | Member; admins see the email in the user list | Until deletion (soft-deleted identity) |
| Display name, avatar, bio, country/region/city | `profiles` | Public (name, avatar, bio, general location) | Anonymised on deletion |
| Phone | `profiles.phone` | Member only (column-level grants) | Removed on deletion |
| Storefront contact (email, phone, WhatsApp) | `seller_profiles` | Public **only if the seller adds it** | Removed on deletion |
| Listings and photos | `listings`, Storage | Public while active | Archived on deletion |
| Messages and offers | `messages`, `offers` | Conversation participants; moderators when investigating a report | Kept for the other party, attributed to "Deleted member" |
| Reports | `reports` | Reporter and staff | Kept for safety records |
| Listing views | `listing_view_events` (pseudonymous key per day) | Aggregated counts only | 90 days |
| Sponsored impressions/clicks | `promotion_events` (salted hash of user id or random cookie) | Aggregated counts only | 400 days |
| Notifications | `notifications` | Member | Read items deleted after 180 days |
| Payments for optional services | `platform_payments`, `payment_events`, ledger | Member and admins | Retained for tax and accounting periods (confirm per market) |
| Admin actions | `admin_audit_logs`, `moderation_actions` | Admins | Retained; append-only |

**Cookies:**

- Supabase auth session (essential)
- `nm_country` (market preference)
- `nm_theme` (appearance)
- `nm_vid` (random, httpOnly, used only to de-duplicate sponsored counts)

There are no third-party advertising or analytics trackers.

## Data-subject rights (implemented)

- **Access and portability:** Account > Download my data returns a JSON export of profile, storefront, listings, favourites, follows,
  blocks, conversations and messages, offers, reviews, reports, notifications and verification requests (`/api/account/export`). It is
  rate-limited.
- **Rectification:** profile and storefront editing.
- **Restriction:** Account > Deactivate hides the profile, storefront and listings. Reactivation is self-service.
- **Erasure:** Account > Delete account. Typed confirmation is required. `anonymise_my_account()`:
  - archives listings
  - removes favourites, follows, notifications and blocks
  - anonymises the profile and storefront
  - writes an audit entry
  The auth identity is then soft-deleted with the service role, so the email can no longer sign in.
- **Marketing consent:** opt-in only (notification preferences).

## Still to do before launch

1. Lawyer-reviewed Terms, Privacy Notice, Prohibited Items and Complaints policy per market (Admin > Policies stores market-specific text).
2. Register with each data-protection authority where required. Appoint a DPO or representative where required.
3. Records of processing, and data-processing agreements with Supabase, the host, the email provider and the payment provider. Document
   the safeguards for any international transfers (Supabase regions are outside Africa).
4. A breach-response plan, including the regulator notification deadlines in each law.
5. Age gating: the terms require 18+, but age is not verified.
6. Deletion of photos from Storage on account deletion. Today listings are archived, and their images remain in the bucket until a
   clean-up job is added.
7. Consumer-protection review of the "Sponsored" labelling and seller-plan wording.
