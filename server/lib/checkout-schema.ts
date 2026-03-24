import { z } from "zod";
import type { CatalogProduct } from "./product-catalog.js";

const nameRegex = /^[\p{L}\p{M}.'\- ]+$/u;
const phoneRegex = /^[0-9()+\-.\s]{7,22}$/;
const postalRegex = /^[A-Za-z0-9\- ]{3,20}$/;
const deliveryMethodSchema = z.enum(["shipping", "pickup"]);
const HARD_MAX_ITEM_QUANTITY = 10;

export const checkoutCustomerSchema = z
  .object({
    deliveryMethod: deliveryMethodSchema.default("shipping"),
    fullName: z
      .string()
      .trim()
      .min(2, "Full name is required.")
      .max(120, "Full name is too long.")
      .regex(nameRegex, "Full name contains invalid characters."),
    email: z.string().trim().toLowerCase().email("A valid email is required.").max(160, "Email is too long."),
    phone: z
      .string()
      .trim()
      .min(7, "Phone number is required.")
      .max(22, "Phone number is too long.")
      .regex(phoneRegex, "Phone number format is invalid."),
    address: z.string().trim().max(200, "Address is too long.").default(""),
    city: z.string().trim().max(80, "City is too long.").default(""),
    state: z.string().trim().max(80, "State / Province is too long.").default(""),
    postalCode: z.string().trim().max(20, "Postal code is too long.").default(""),
    country: z.string().trim().max(80, "Country is too long.").default(""),
  })
  .strict()
  .superRefine((value, ctx) => {
    const needsShippingAddress = value.deliveryMethod === "shipping";

    if (needsShippingAddress) {
      if (value.address.length < 4) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["address"],
          message: "Address is required.",
        });
      }

      if (value.city.length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["city"],
          message: "City is required.",
        });
      } else if (!nameRegex.test(value.city)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["city"],
          message: "City contains invalid characters.",
        });
      }

      if (value.state.length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["state"],
          message: "State / Province is required.",
        });
      } else if (!nameRegex.test(value.state)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["state"],
          message: "State / Province contains invalid characters.",
        });
      }

      if (value.postalCode.length < 3) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["postalCode"],
          message: "Postal code is required.",
        });
      } else if (!postalRegex.test(value.postalCode)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["postalCode"],
          message: "Postal code format is invalid.",
        });
      }

      if (value.country.length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["country"],
          message: "Country is required.",
        });
      } else if (!nameRegex.test(value.country)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["country"],
          message: "Country contains invalid characters.",
        });
      }

      return;
    }

    if (value.city && !nameRegex.test(value.city)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["city"],
        message: "City contains invalid characters.",
      });
    }

    if (value.state && !nameRegex.test(value.state)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["state"],
        message: "State / Province contains invalid characters.",
      });
    }

    if (value.postalCode && !postalRegex.test(value.postalCode)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["postalCode"],
        message: "Postal code format is invalid.",
      });
    }

    if (value.country && !nameRegex.test(value.country)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["country"],
        message: "Country contains invalid characters.",
      });
    }
  });

const checkoutItemSelectionSchema = z
  .object({
    size: z.string().trim().min(1, "Size is required.").max(80, "Size is too long."),
    color: z.string().trim().min(1, "Color is required.").max(80, "Color is too long."),
  })
  .strict();

export const checkoutItemSchema = z
  .object({
    productId: z.string().trim().min(1, "Product ID is required.").max(120, "Product ID is too long."),
    quantity: z.number().int().min(1).max(HARD_MAX_ITEM_QUANTITY),
    selection: checkoutItemSelectionSchema,
  })
  .strict();

export const checkoutShippingQuoteSchema = z
  .object({
    token: z.string().trim().min(24).max(2048),
  })
  .strict();

export const checkoutRequestSchema = z
  .object({
    customer: checkoutCustomerSchema,
    items: z.array(checkoutItemSchema).min(1, "Cart cannot be empty.").max(50, "Too many items in cart."),
    idempotencyKey: z.string().trim().min(16).max(128).optional(),
    cartToken: z.string().trim().min(16).max(256).optional(),
    cartTimestamp: z.number().int().optional(),
    website: z.string().trim().max(0).optional(), // honeypot
    discountCode: z
      .string()
      .trim()
      .max(40)
      .regex(/^[A-Za-z0-9_-]*$/, "Discount code format is invalid.")
      .optional(),
    promoCode: z
      .string()
      .trim()
      .max(40)
      .regex(/^[A-Za-z0-9_-]*$/, "Promo code format is invalid.")
      .optional(),
    shippingQuote: checkoutShippingQuoteSchema.optional(),
  })
  .strict();

const normalizeMaxQuantity = (value: unknown) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.max(0, Math.floor(parsed));
};

export const getMaxQuantityForCatalogProduct = (product: CatalogProduct) => {
  if (product.availability === "sold_out") {
    return 0;
  }

  const configured = normalizeMaxQuantity(product.maxQuantity);
  if (configured === null) {
    return 1;
  }

  return Math.min(Math.max(1, configured), HARD_MAX_ITEM_QUANTITY);
};

export type CheckoutCustomerInput = z.infer<typeof checkoutCustomerSchema>;
export type CheckoutItemInput = z.infer<typeof checkoutItemSchema>;
export type CheckoutShippingQuoteInput = z.infer<typeof checkoutShippingQuoteSchema>;
export type CheckoutRequestInput = z.infer<typeof checkoutRequestSchema>;
