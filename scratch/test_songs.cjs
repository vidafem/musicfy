const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function test() {
  try {
    const { data, error } = await supabase
      .from('songs')
      .select('*')
      .limit(1);
    
    if (error) {
      console.error('Error fetching songs:', error);
      return;
    }
    
    console.log('Sample song columns:', data.length > 0 ? Object.keys(data[0]) : 'No songs found');
    console.log('Sample song data:', data[0]);
  } catch (err) {
    console.error('Failed to run test:', err);
  }
}

test();
