// add_housekeepers.js – with verbose Auth‑error logging
require('dotenv').config();                 // Load .env first
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

// -------------------- CONFIG --------------------
const SUPABASE_URL = process.env.SUPABASE_URL?.trim();
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('\n❌  Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

// -------------------- SUPABASE CLIENT --------------------
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
  // optional: increase fetch timeout (default ~10 s)
  // fetch: (url, opts) => fetch(url, { ...opts, signal: AbortSignal.timeout(20000) })
});

// -------------------- HOUSEKEEPER LIST --------------------
const housekeepers = [
  {
    email:    'alice.housekeeper@example.com',
    name:     'Alice Housekeeper',
    password: 'SuperSecret123!'   // custom password (optional)
  },
  {
    email:    'bob.housekeeper@example.com',
    name:     'Bob Housekeeper',
    // no password ⇒ random will be generated
  },
  // ← add more entries as needed
];

// -------------------- HELPERS --------------------
function randomPassword(len = 12) {
  return crypto.randomBytes(len).toString('base64');
}

/**
 * Create (or fetch) a Supabase Auth user.
 * Returns the user object on success, or null on fatal error.
 * Prints the whole error object for debugging.
 */
async function createOrFetchUser(email, password) {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const { data: user, error } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

      // ---- Success ----
      if (user) return user;

      // ---- Already exists ----
      if (error?.message?.includes('User already registered')) {
        console.log(`⚠️  ${email} already exists – fetching existing record`);
        const { data: existing } = await supabase
          .from('auth.users')
          .select('id')
          .eq('email', email)
          .single();
        return existing || null;
      }

      // ---- Other errors ----
      throw error;
    } catch (e) {
      const isTimeout = e?.code === 'UND_ERR_CONNECT_TIMEOUT';
      console.error(`❗  Attempt ${attempt} for ${email} failed.`);
      console.error('   Error details:', JSON.stringify(e, null, 2));

      if (isTimeout && attempt < maxAttempts) {
        console.warn('⏳  Timeout – will retry after a short pause...');
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }
      // Fatal – give up
      return null;
    }
  }
  return null;
}

// -------------------- MAIN LOGIC --------------------
async function addHousekeepers() {
  for (const hk of housekeepers) {
    try {
      const pwd = hk.password ? hk.password : randomPassword();

      const user = await createOrFetchUser(hk.email, pwd);
      if (!user || !user.id) {
        console.error(`❌  Skipping profile insert for ${hk.email} – no valid Auth user.`);
        continue; // go to next housekeeper
      }

      // Upsert profile row (link Auth user → profiles)
      const { error: profErr } = await supabase
        .from('profiles')
        .upsert(
          {
            id:   user.id,
            name: hk.name,
            role: 'housekeeper',
          },
          { onConflict: 'id' }
        );

      if (profErr) throw profErr;

      console.log(`✅  Housekeeper added/updated: ${hk.email} (id=${user.id})`);
      if (!hk.password) console.log(`    → generated password: ${pwd}`);
    } catch (e) {
      console.error(`❌  Unexpected failure for ${hk.email}: ${e.message || e}`);
    }
  }
}

// ---- Execute ----
addHousekeepers()
  .then(() => console.log('🎉  All processed.'))
  .catch(e => console.error('❌  Unhandled error:', e));