import { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '@/lib/supabase';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Perform a simple query to keep the database active
    // This query is lightweight and doesn't affect any data
    const { data, error } = await supabase
      .from('licenses')
      .select('id')
      .limit(1);

    if (error) {
      console.error('Keep-alive query failed:', error);
      return res.status(500).json({
        success: false,
        error: 'Database query failed',
        timestamp: new Date().toISOString(),
      });
    }

    console.log('Database keep-alive successful');

    return res.status(200).json({
      success: true,
      message: 'Database keep-alive successful',
      timestamp: new Date().toISOString(),
      data: data ? 'Database is active' : 'No data returned (expected)',
    });
  } catch (error) {
    console.error('Keep-alive error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      timestamp: new Date().toISOString(),
    });
  }
}
