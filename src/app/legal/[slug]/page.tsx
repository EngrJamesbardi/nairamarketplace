import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSelectedCountry } from "@/lib/market";

const DRAFT_NOTICE = "Draft for review. This text has not yet been reviewed by a qualified lawyer and must be approved before public launch.";

const PAGES: Record<string, { title: string; body: string[] }> = {
  terms: {
    title: "Terms of use",
    body: [
      "Naira Marketplace provides an online meeting place where independent buyers and sellers can list items, find each other, communicate and negotiate. We are not a party to any sale between users.",
      "We do not own, inspect, store or deliver the items listed, and we do not collect payments for items on behalf of sellers. Buyers and sellers agree price, payment method, delivery, collection, returns and all other terms directly with each other.",
      "We do not guarantee any seller, buyer, item, listing, payment or delivery. A “Verified” badge means only that our team reviewed specific documents at a point in time.",
      "You must be at least 18 years old, provide accurate information, and comply with the laws of your country. You must not list prohibited items, mislead other users, spam, harass, or attempt to move users to fraudulent payment pages.",
      "Browsing, registering, storefronts and ordinary listings are free. Optional paid services (promotional credits and seller plans) are described before purchase. We never charge you automatically without your explicit consent.",
      "We may remove content, limit features or suspend accounts that breach these terms or our policies. You can appeal a moderation decision through the complaints process.",
      "These terms will be supplemented by country-specific terms for each active market.",
    ],
  },
  privacy: {
    title: "Privacy policy",
    body: [
      "We collect only what we need to run the marketplace: your email and password (handled by our authentication provider), display name, general location (country, region, city), the listings and messages you create, and basic usage data such as listing views.",
      "Your phone number and exact contact details are never shown publicly unless you choose to add them to your storefront. Listing locations are shown as a general area only.",
      "Messages are visible only to the people in the conversation and, where necessary to investigate a report, to our moderators.",
      "We do not sell your personal data. We use service providers for hosting, database, authentication, storage and (when you buy optional services) payment processing. Card details are entered on the payment provider's page and are never stored by us.",
      "You can download a copy of your data, deactivate your account, or request deletion from your account page. Some records (for example payment records for optional services) may be retained where the law requires.",
      "Marketing messages are opt-in only and can be switched off at any time in your account settings.",
      "Applicable laws include, among others, the Nigeria Data Protection Act 2023, Ghana's Data Protection Act 2012, Kenya's Data Protection Act 2019 and South Africa's POPIA. Country-specific notices will be added for each market before activation.",
    ],
  },
  complaints: {
    title: "Complaints and appeals",
    body: [
      "To report a listing, seller or message, use the Report button on the listing, storefront or conversation. Reports go to our moderation queue and are reviewed by a person.",
      "If your listing was removed or your account was restricted and you believe this was a mistake, reply to the notification or contact support with the listing or account details. A different moderator will review the appeal where possible.",
      "Disputes about a sale (payment, delivery, item condition) are between the buyer and seller. We can act on breaches of our policies, such as fraud or prohibited items, but cannot refund money paid to another user.",
      "If you have been the victim of fraud, please also report it to the police in your country.",
    ],
  },
};

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return { title: PAGES[slug]?.title ?? (slug === "prohibited" ? "Prohibited items" : slug === "safety" ? "Trading safely" : "Policy") };
}

export default async function LegalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (slug === "prohibited" || slug === "safety") {
    const kind = slug === "prohibited" ? "prohibited_items" : "safety";
    const country = await getSelectedCountry();
    const supabase = await createClient();
    const { data } = await supabase.from("country_policies").select("*").eq("kind", kind).or(`country_code.is.null,country_code.eq.${country.code}`).order("country_code", { nullsFirst: true });
    return (
      <article className="page max-w-3xl space-y-6">
        <h1 className="h1">{slug === "prohibited" ? "Prohibited and restricted items" : "Trading safely"}</h1>
        <p className="rounded-lg bg-warning/10 p-3 text-sm text-warning">{DRAFT_NOTICE}</p>
        {(data ?? []).map((p) => (
          <section key={p.id} className="space-y-2">
            <h2 className="h2">{p.title}</h2>
            {p.body.split("\n\n").map((para, i) => <p key={i} className="text-sm leading-relaxed">{para}</p>)}
          </section>
        ))}
        {slug === "safety" && (
          <ul className="list-disc space-y-1 pl-5 text-sm">
            <li>Keep conversations on Naira Marketplace so you have a record.</li>
            <li>Be wary of links in messages, especially ones asking you to log in or pay. We flag messages that contain links.</li>
            <li>If a deal seems too good to be true, it probably is.</li>
            <li>Report suspicious listings and members. Block anyone who harasses you.</li>
          </ul>
        )}
      </article>
    );
  }
  const page = PAGES[slug];
  if (!page) notFound();
  return (
    <article className="page max-w-3xl space-y-4">
      <h1 className="h1">{page.title}</h1>
      <p className="rounded-lg bg-warning/10 p-3 text-sm text-warning">{DRAFT_NOTICE}</p>
      {page.body.map((p, i) => <p key={i} className="text-sm leading-relaxed">{p}</p>)}
    </article>
  );
}
