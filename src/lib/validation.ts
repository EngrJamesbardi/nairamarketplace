import { z } from "zod";
import { parseToMinor } from "@/lib/money";

export const CONDITIONS = ["new", "like_new", "used_good", "used_fair", "for_parts"] as const;
export const PRICE_TYPES = ["fixed", "negotiable", "contact"] as const;
export const DELIVERY_OPTIONS = ["local_pickup", "buyer_collection", "seller_dispatch", "courier", "other"] as const;
export const SELLER_TYPES = ["individual", "trader", "shop", "wholesaler", "business"] as const;
export const LISTING_STATUSES = ["draft", "active", "paused", "reserved", "sold", "archived", "expired"] as const;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : null));

export const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters")
  .max(72, "Use at most 72 characters")
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), "Include at least one letter and one number");

export const signUpSchema = z.object({
  displayName: z.string().trim().min(2, "Enter your name").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email address").max(254),
  password: passwordSchema,
  countryCode: z.string().regex(/^[A-Z]{2}$/),
  acceptTerms: z.literal("on", { error: "You must accept the terms and privacy policy" }),
});

export const signInSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});

export const profileSchema = z.object({
  displayName: z.string().trim().min(1).max(80),
  bio: optionalText(500),
  countryCode: z.string().regex(/^[A-Z]{2}$/),
  regionId: z.coerce.number().int().positive().optional().or(z.literal("").transform(() => undefined)),
  city: optionalText(80),
  phone: optionalText(20),
  preferredLanguage: z.string().min(2).max(8).default("en"),
});

export const sellerOnboardingSchema = z.object({
  shopName: z.string().trim().min(2, "Shop name must be at least 2 characters").max(80),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(60)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lowercase letters, numbers and single hyphens"),
  sellerType: z.enum(SELLER_TYPES),
  description: optionalText(1000),
  countryCode: z.string().regex(/^[A-Z]{2}$/),
  regionId: z.coerce.number().int().positive().optional().or(z.literal("").transform(() => undefined)),
  city: optionalText(80),
  contactEmail: z
    .string()
    .trim()
    .email()
    .max(254)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  contactPhone: optionalText(20),
  whatsappNumber: optionalText(20),
  showWhatsapp: z
    .string()
    .optional()
    .transform((v) => v === "on"),
  businessName: optionalText(120),
  businessRegistrationNumber: optionalText(60),
  businessHours: optionalText(200),
  deliveryOptions: z.array(z.enum(DELIVERY_OPTIONS)).min(1, "Choose at least one delivery or collection option"),
  deliveryNotes: optionalText(500),
});

export const listingSchema = z
  .object({
    title: z.string().trim().min(3, "Title must be at least 3 characters").max(120),
    description: z.string().trim().min(10, "Description must be at least 10 characters").max(5000),
    categoryId: z.coerce.number().int().positive("Choose a category"),
    subcategoryId: z.coerce.number().int().positive().optional().or(z.literal("").transform(() => undefined)),
    priceType: z.enum(PRICE_TYPES),
    price: z.string().trim().optional(),
    currency: z.string().regex(/^[A-Z]{3}$/),
    condition: z.enum(CONDITIONS),
    quantity: z.coerce.number().int().min(0).max(100000),
    regionId: z.coerce.number().int().positive().optional().or(z.literal("").transform(() => undefined)),
    city: optionalText(80),
    deliveryOptions: z.array(z.enum(DELIVERY_OPTIONS)).min(1, "Choose at least one delivery or collection option"),
    deliveryNotes: optionalText(500),
    status: z.enum(["draft", "active"]).default("active"),
    attributes: z.record(z.string(), z.union([z.string().max(100), z.number()])).default({}),
  })
  .transform((v, ctx) => {
    let priceMinor: bigint | null = null;
    if (v.priceType !== "contact") {
      priceMinor = v.price ? parseToMinor(v.price, v.currency) : null;
      if (priceMinor === null) {
        ctx.addIssue({ code: "custom", path: ["price"], message: "Enter a valid price" });
        return z.NEVER;
      }
      if (priceMinor > 100_000_000_000_00n) {
        ctx.addIssue({ code: "custom", path: ["price"], message: "Price is too large" });
        return z.NEVER;
      }
    }
    return { ...v, priceMinor };
  });

export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGES = 8;

/** Check magic bytes, not just the declared MIME type. */
export function sniffImageType(bytes: Uint8Array): (typeof ALLOWED_IMAGE_TYPES)[number] | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  )
    return "image/webp";
  return null;
}

export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const k = issue.path.join(".") || "_";
    if (!out[k]) out[k] = issue.message;
  }
  return out;
}

export type ActionState = { ok?: boolean; error?: string; fieldErrors?: Record<string, string>; message?: string; redirectTo?: string } | null;
