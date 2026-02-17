import { z } from "zod";

const nameRegex = /^[\p{L}\p{M}.'\- ]+$/u;
const phoneRegex = /^[0-9()+\-.\s]{7,22}$/;
const postalRegex = /^[A-Za-z0-9\- ]{3,20}$/;

export const checkoutCustomerSchema = z
  .object({
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
      .max(22, "Phone number is too long.")
      .regex(phoneRegex, "Phone number format is invalid.")
      .optional()
      .or(z.literal("")),
    address: z.string().trim().min(4, "Address is required.").max(200, "Address is too long."),
    city: z
      .string()
      .trim()
      .min(2, "City is required.")
      .max(80, "City is too long.")
      .regex(nameRegex, "City contains invalid characters."),
    state: z
      .string()
      .trim()
      .min(2, "State / Province is required.")
      .max(80, "State / Province is too long.")
      .regex(nameRegex, "State / Province contains invalid characters."),
    postalCode: z
      .string()
      .trim()
      .min(3, "Postal code is required.")
      .max(20, "Postal code is too long.")
      .regex(postalRegex, "Postal code format is invalid."),
    country: z
      .string()
      .trim()
      .min(2, "Country is required.")
      .max(80, "Country is too long.")
      .regex(nameRegex, "Country contains invalid characters."),
  })
  .strict();

export const checkoutItemSchema = z
  .object({
    productId: z.string().trim().min(1, "Product ID is required.").max(120, "Product ID is too long."),
    quantity: z.number().int().min(1).max(10),
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
    promoCode: z.string().trim().max(40).optional(),
  })
  .strict();

export type CheckoutCustomerInput = z.infer<typeof checkoutCustomerSchema>;
export type CheckoutItemInput = z.infer<typeof checkoutItemSchema>;
export type CheckoutRequestInput = z.infer<typeof checkoutRequestSchema>;
