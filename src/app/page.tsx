import Link from "next/link";
import * as Icons from "lucide-react";
import { ArrowRight, Plus, BadgeCheck, MapPin } from "lucide-react";
import { SearchBar } from "@/components/SearchBar";
import { ProductCard, ProductGrid, EmptyState } from "@/components/ProductCard";
import { getCategories, getSelectedCountry, getSetting, getRegions } from "@/lib/market";
import { discover, favouriteIds } from "@/lib/listings";
import { getSponsored } from "@/lib/promotions";
import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { countryFlag } from "@/lib/countries";

export default async function HomePage({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  const { deleted } = await searchParams;
  const [country, categories, session, tagline] = await Promise.all([
    getSelectedCountry(),
    getCategories(),
    getSession(),
    getSetting<string>("tagline", "Africa's Open Market. Your Deals, Your Way."),
  ]);
  const regionId = session.profile?.country_code === country.code ? session.profile?.region_id : null;
  const supabase = await createClient();

  const [recent, popular, bargains, near, sponsored, featuredSellers, regions] = await Promise.all([
    discover(country.code, { order: "newest", limit: 10 }),
    discover(country.code, { order: "popular", limit: 5 }),
    discover(country.code, { negotiable: true, limit: 5 }),
    regionId ? discover(country.code, { regionId, limit: 5 }) : Promise.resolve(null),
    getSponsored("homepage", country.code, { limit: 2 }),
    supabase
      .from("seller_profiles")
      .select("user_id, shop_name, slug, logo_url, city, seller_type, verification_status, is_seed")
      .eq("country_code", country.code)
      .eq("is_featured", true)
      .limit(6),
    getRegions(country.code),
  ]);

  const allIds = [...recent.data, ...popular.data, ...bargains.data, ...(near?.data ?? []), ...sponsored.map((s) => s.item)].map((l) => l.id);
  const favs = await favouriteIds(session.user?.id, allIds);
  const regionName = regionId ? regions.find((r) => r.id === regionId)?.name : null;
  const topCategories = categories.filter((c) => !c.parent_id);

  return (
    <div>
      {deleted && <p role="status" className="bg-success/10 px-4 py-3 text-center text-sm text-success">Your account has been deleted. Thank you for using Naira Marketplace.</p>}
      <section className="border-b border-line bg-cream">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 md:grid-cols-[1.4fr_1fr] md:py-12">
          <div>
            <p className="text-sm font-semibold text-brand-strong">
              {countryFlag(country.code)} Browsing {country.name} · prices in {country.currency_code}
            </p>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">{tagline}</h1>
            <p className="mt-3 max-w-xl text-muted">
              Find what you need from traders, shops and neighbours. Message sellers, make offers and agree your own
              payment and delivery. Free to browse, free to list.
            </p>
            <SearchBar className="mt-5 hidden max-w-xl md:block" />
          </div>
          <div className="flex flex-col justify-center gap-3 rounded-2xl bg-surface p-5 shadow-sm">
            <p className="text-lg font-bold">Got something to sell?</p>
            <p className="text-sm text-muted">Set up your storefront in minutes. No business registration needed to sell personal items.</p>
            <Link href="/sell" className="btn-primary self-start">
              <Plus className="size-4" aria-hidden /> Sell an item
            </Link>
          </div>
        </div>
      </section>

      <div className="page space-y-10">
        <section aria-labelledby="cats">
          <h2 id="cats" className="h2 mb-3">Categories</h2>
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {topCategories.map((c) => {
              const Icon = (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[c.icon ?? "Package"] ?? Icons.Package;
              return (
                <li key={c.id}>
                  <Link
                    href={`/search?category=${c.slug}`}
                    className="card flex h-full min-h-24 flex-col items-center justify-center gap-2 p-3 text-center text-xs font-medium hover:border-brand hover:text-brand sm:text-sm"
                  >
                    <span className="flex size-10 items-center justify-center rounded-full bg-cream text-brand">
                      <Icon className="size-5" aria-hidden />
                    </span>
                    {c.name}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        {sponsored.length > 0 && (
          <Section title="Sponsored" subtitle="Paid placements from sellers. Clearly labelled and limited.">
            <ProductGrid>
              {sponsored.map((s) => (
                <ProductCard key={s.campaignId} item={s.item} sponsored campaignId={s.campaignId} favourited={favs.has(s.item.id!)} />
              ))}
            </ProductGrid>
          </Section>
        )}

        <Section title="Recently listed" href="/search?sort=newest">
          {recent.error ? (
            <EmptyState title="We couldn't load listings" body="Please check your connection and try again." />
          ) : recent.data.length === 0 ? (
            <EmptyState
              title={`No listings in ${country.name} yet`}
              body="Be one of the first sellers in this market."
              action={<Link href="/sell" className="btn-primary mt-2">Post the first listing</Link>}
            />
          ) : (
            <ProductGrid>
              {recent.data.map((l) => <ProductCard key={l.id} item={l} favourited={favs.has(l.id!)} />)}
            </ProductGrid>
          )}
        </Section>

        {near && (
          <Section title={`Near you${regionName ? ` in ${regionName}` : ""}`} href={`/search?region=${regionId}`} icon={<MapPin className="size-5 text-brand" aria-hidden />}>
            {near.data.length === 0 ? (
              <EmptyState title="Nothing listed near you yet" body="Try browsing the whole country." />
            ) : (
              <ProductGrid>{near.data.map((l) => <ProductCard key={l.id} item={l} favourited={favs.has(l.id!)} />)}</ProductGrid>
            )}
          </Section>
        )}

        {popular.data.length > 0 && (
          <Section title="Popular right now" subtitle="Based on saves and views on this platform." href="/search?sort=relevance">
            <ProductGrid>{popular.data.map((l) => <ProductCard key={l.id} item={l} favourited={favs.has(l.id!)} />)}</ProductGrid>
          </Section>
        )}

        {bargains.data.length > 0 && (
          <Section title="Open to offers" subtitle="Negotiable prices. Make an offer." href="/search?negotiable=1">
            <ProductGrid>{bargains.data.map((l) => <ProductCard key={l.id} item={l} favourited={favs.has(l.id!)} />)}</ProductGrid>
          </Section>
        )}

        {(featuredSellers.data?.length ?? 0) > 0 && (
          <Section title="Featured sellers" subtitle="Selected by our team. Featuring is not a guarantee of any seller.">
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {featuredSellers.data!.map((s) => (
                <li key={s.user_id}>
                  <Link href={`/s/${s.slug}`} className="card flex h-full flex-col items-center gap-2 p-4 text-center hover:border-brand">
                    <span className="flex size-14 items-center justify-center overflow-hidden rounded-full bg-cream text-lg font-bold text-brand">
                      {s.logo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={s.logo_url} alt="" className="size-full object-cover" />
                      ) : (
                        s.shop_name.slice(0, 1)
                      )}
                    </span>
                    <span className="flex items-center gap-1 text-sm font-semibold">
                      {s.shop_name}
                      {s.verification_status === "verified" && <BadgeCheck className="size-4 text-success" aria-label="Verified" />}
                    </span>
                    <span className="text-xs text-muted">{s.city}</span>
                    {s.is_seed && <span className="badge bg-ink/80 text-white">Demo</span>}
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>
    </div>
  );
}

function Section({
  title,
  subtitle,
  href,
  icon,
  children,
}: {
  title: string;
  subtitle?: string;
  href?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h2 className="h2 flex items-center gap-2">
            {icon}
            {title}
          </h2>
          {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
        </div>
        {href && (
          <Link href={href} className="link flex shrink-0 items-center gap-1 text-sm">
            See all <ArrowRight className="size-4" aria-hidden />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}
