const { createClient } = require('@supabase/supabase-js');

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Check if environment variables are set
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error('Missing Supabase environment variables:', {
        hasUrl: !!supabaseUrl,
        hasKey: !!supabaseKey,
      });
      return res.status(500).json({
        success: false,
        error: 'Missing Supabase configuration',
        details: 'SUPABASE_URL and SUPABASE_KEY environment variables are required',
        timestamp: new Date().toISOString(),
      });
    }

    // Create Supabase client directly
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Perform a simple query to keep the database active
    const { data, error } = await supabase
      .from('licenses')
      .select('id')
      .limit(1);

    if (error) {
      console.error('Keep-alive query failed:', error);
      return res.status(500).json({
        success: false,
        error: 'Database query failed',
        details: error.message,
        timestamp: new Date().toISOString(),
      });
    }

    console.log('Database keep-alive successful');

    return res.status(200).json({
      success: true,
      message: 'Database keep-alive successful',
      timestamp: new Date().toISOString(),
      data: 'Database connection active',
    });
  } catch (error) {
    console.error('Keep-alive error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
}
