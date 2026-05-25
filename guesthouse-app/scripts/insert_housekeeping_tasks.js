require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL?.trim();
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function run() {
  const { data: housekeepers, error: hkErr } = await supabase
    .from('profiles')
    .select('id,name,email')
    .ilike('role', '%housekeeper%');

  if (hkErr) {
    console.error('Failed to fetch housekeepers:', hkErr);
    process.exit(1);
  }

  const { data: rooms, error: roomErr } = await supabase
    .from('rooms')
    .select('id,number')
    .order('number', { ascending: true })
    .limit(10);

  if (roomErr) {
    console.error('Failed to fetch rooms:', roomErr);
    process.exit(1);
  }

  if (!housekeepers?.length) {
    console.error('No housekeepers found in profiles table.');
    process.exit(1);
  }

  if (!rooms?.length) {
    console.error('No rooms found in rooms table.');
    process.exit(1);
  }

  const staffId = housekeepers[0].id;
  const inserts = [
    {
      staff_id: staffId,
      room_id: rooms[0].id,
      notes: 'Change linens and restock minibar.',
      status: 'pending',
    },
    {
      staff_id: staffId,
      room_id: rooms[1]?.id ?? rooms[0].id,
      notes: 'Deep clean bathroom and replace towels.',
      status: 'pending',
    },
    {
      staff_id: staffId,
      room_id: rooms[2]?.id ?? rooms[0].id,
      notes: 'Inspect room for maintenance issues and tidy up.',
      status: 'pending',
    },
  ];

  const { data: inserted, error: insertErr } = await supabase
    .from('housekeeping_tasks')
    .insert(inserts)
    .select();

  if (insertErr) {
    console.error('Failed to insert housekeeping tasks:', insertErr);
    process.exit(1);
  }

  console.log('Inserted housekeeping tasks:', JSON.stringify(inserted, null, 2));
}

run().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
