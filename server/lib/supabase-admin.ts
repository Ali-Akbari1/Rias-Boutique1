import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cachedClient: SupabaseClient | null = null;
let cachedUrl = "";
let cachedServiceRoleKey = "";

const resolveSupabaseUrl = () =>
  process.env.SUPABASE_URL?.trim() ||
  process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
  process.env.VITE_SUPABASE_URL?.trim() ||
  "";

const resolveServiceRoleKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";

export const hasSupabaseAdminConfig = () => Boolean(resolveSupabaseUrl() && resolveServiceRoleKey());

export const getSupabaseAdminClient = () => {
  const supabaseUrl = resolveSupabaseUrl();
  const serviceRoleKey = resolveServiceRoleKey();

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }

  if (cachedClient && cachedUrl === supabaseUrl && cachedServiceRoleKey === serviceRoleKey) {
    return cachedClient;
  }

  cachedClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  cachedUrl = supabaseUrl;
  cachedServiceRoleKey = serviceRoleKey;
  return cachedClient;
};
