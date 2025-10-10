import { NextApiRequest, NextApiResponse } from 'next';
import { getLicense, getActivations } from '@/lib/supabase';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { key } = req.query;

    if (!key || typeof key !== 'string') {
      return res.status(400).json({ error: 'License key is required' });
    }

    // Get license and activations
    const license = await getLicense(key);

    if (!license) {
      return res.status(404).json({ error: 'License not found' });
    }

    const activations = await getActivations(key);

    return res.status(200).json({
      license,
      activations,
    });
  } catch (error) {
    console.error('License details error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
