// ── Change this to your computer's local IP ──────────────────
// Run: ipconfig (Windows) or ifconfig (Linux/Mac) to find it
import { createClient } from "@supabase/supabase-js";
// Example: 192.168.1.5
// ─────────────────────────────────────────────────────────────
export const SUPABASE_URL = 'https://ujrpuvcufnqolewvlavr.supabase.co';
// constants/api.ts



export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVqcnB1dmN1Zm5xb2xld3ZsYXZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4MDUwNTMsImV4cCI6MjA5MzM4MTA1M30.kclWyWvubsH7fXG9FA8ifaQsPzq9SQtdA0m67rHfWuM";

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

export const API = {
  transcribe: `${SUPABASE_URL}/functions/v1/transcribe`,
  plan: `${SUPABASE_URL}/functions/v1/plan`,
  embed: `${SUPABASE_URL}/functions/v1/embed`,
  search: `${SUPABASE_URL}/functions/v1/search`,
};