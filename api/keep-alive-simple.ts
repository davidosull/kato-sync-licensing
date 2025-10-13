import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Check if environment variables are set
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error('Missing Supabase environment variables:', {
        hasUrl: !!supabaseUrl,
        hasKey: !!supabaseKey,
      });
      return res.status(500).json({
        success: false,
        error: 'Missing Supabase configuration',
        details:
          'SUPABASE_URL and SUPABASE_ANON_KEY environment variables are required',
        timestamp: new Date().toISOString(),
      });
    }

    // Create a fresh Supabase client for this request
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Try the simplest possible query - just test the connection
    // This should work even if tables don't exist yet
    const { data, error } = await supabase
      .from('pg_tables')
      .select('tablename')
      .limit(1);

    if (error) {
      console.error('Keep-alive query failed:', error);
      return res.status(500).json({
        success: false,
        error: 'Database connection failed',
        details: error.message,
        code: error.code,
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
