import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Check if environment variables are set
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({
        success: false,
        error: 'Missing Supabase configuration',
        details:
          'SUPABASE_URL and SUPABASE_ANON_KEY environment variables are required',
        timestamp: new Date().toISOString(),
      });
    }

    // Create Supabase client
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Try a simple connection test first
    const { data, error } = await supabase
      .from('pg_tables')
      .select('tablename')
      .limit(1);

    if (error) {
      return res.status(500).json({
        success: false,
        error: 'Database connection failed',
        details: error.message,
        code: error.code,
        hint: error.hint,
        timestamp: new Date().toISOString(),
        debug: {
          urlLength: supabaseUrl.length,
          keyLength: supabaseKey.length,
          urlStart: supabaseUrl.substring(0, 20) + '...',
          keyStart: supabaseKey.substring(0, 10) + '...',
        },
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Database connection successful',
      timestamp: new Date().toISOString(),
      data: 'Connection test passed',
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
}
