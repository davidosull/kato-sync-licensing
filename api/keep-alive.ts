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

    // Create Supabase client directly
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Try multiple approaches to keep the database active
    // First, try a simple query on licenses table
    let { data, error } = await supabase.from('licenses').select('id').limit(1);

    // If licenses table doesn't exist or has issues, try a system query
    if (error && error.code === 'PGRST116') {
      console.log('Licenses table not found, trying system query');
      const systemQuery = await supabase
        .from('pg_tables')
        .select('tablename')
        .limit(1);

      if (systemQuery.error) {
        // If system query fails, try a simple connection test
        console.log('System query failed, trying connection test');
        const connectionTest = await supabase.rpc('version');

        if (connectionTest.error) {
          // If all queries fail, the database might be paused
          return res.status(500).json({
            success: false,
            error: 'Database appears to be paused or unavailable',
            details:
              'All database queries failed. Check if your Supabase database is active.',
            timestamp: new Date().toISOString(),
          });
        } else {
          data = connectionTest.data as any;
          error = null;
        }
      } else {
        data = systemQuery.data as any;
        error = null;
      }
    }

    if (error) {
      console.error('Keep-alive query failed:', error);
      return res.status(500).json({
        success: false,
        error: 'Database query failed',
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
