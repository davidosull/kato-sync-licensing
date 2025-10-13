import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Check environment variables
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_KEY;

    const diagnostics = {
      timestamp: new Date().toISOString(),
      environment: {
        nodeEnv: process.env.NODE_ENV,
        hasSupabaseUrl: !!supabaseUrl,
        hasSupabaseKey: !!supabaseKey,
        supabaseUrlLength: supabaseUrl ? supabaseUrl.length : 0,
        supabaseKeyLength: supabaseKey ? supabaseKey.length : 0,
      },
      vercel: {
        region: process.env.VERCEL_REGION,
        deploymentUrl: process.env.VERCEL_URL,
      },
    };

    return res.status(200).json({
      success: true,
      message: 'Diagnostics completed',
      diagnostics,
    });
  } catch (error) {
    console.error('Diagnostics error:', error);
    return res.status(500).json({
      success: false,
      error: 'Diagnostics failed',
      details: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
}
