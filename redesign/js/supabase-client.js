// supabase-client.js
// Shared Supabase connection for the booking system.
// This is the SECOND, SEPARATE Supabase project — not the tracker one.
//
// Get these two values from: Supabase Dashboard → Project Settings → API
//   - Project URL
//   - anon / public key (NEVER paste the service_role key here — this file is public)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const supabase = createClient(
  'https://kpjftgaglzcnzqfczpcd.supabase.co',   	// <-- Project URL
  'sb_publishable_3bEXS_nVcR6TVPOYjezNMA_YnfOgLyA'  // <-- anon public key
);
