import { createClient } from '@supabase/supabase-js';
import { License, Activation, SubscriptionEvent } from '@/types';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseKey);

// License operations
export async function getLicense(licenseKey: string): Promise<License | null> {
  const { data, error } = await supabase
    .from('licenses')
    .select('*')
    .eq('license_key', licenseKey)
    .single();

  if (error) {
    console.error('Error fetching license:', error);
    return null;
  }

  return data;
}

export async function createLicense(
  licenseData: Partial<License>
): Promise<License | null> {
  const { data, error } = await supabase
    .from('licenses')
    .insert(licenseData)
    .select()
    .single();

  if (error) {
    console.error('Error creating license:', error);
    return null;
  }

  return data;
}

export async function updateLicense(
  licenseKey: string,
  updates: Partial<License>
): Promise<License | null> {
  const { data, error } = await supabase
    .from('licenses')
    .update(updates)
    .eq('license_key', licenseKey)
    .select()
    .single();

  if (error) {
    console.error('Error updating license:', error);
    return null;
  }

  return data;
}

export async function upsertLicense(
  licenseData: Partial<License>
): Promise<License | null> {
  // Use Supabase upsert with the license_key as the conflict target
  const { data, error } = await supabase
    .from('licenses')
    .upsert(licenseData, {
      onConflict: 'license_key',
      ignoreDuplicates: false,
    })
    .select()
    .single();

  if (error) {
    console.error('Error upserting license:', error);
    return null;
  }

  return data;
}

// Activation operations
export async function getActivations(
  licenseKey: string
): Promise<Activation[]> {
  const { data, error } = await supabase
    .from('activations')
    .select('*')
    .eq('license_key', licenseKey)
    .order('activated_at', { ascending: false });

  if (error) {
    console.error('Error fetching activations:', error);
    return [];
  }

  return data || [];
}

export async function createActivation(
  activationData: Partial<Activation>
): Promise<Activation | null> {
  const { data, error } = await supabase
    .from('activations')
    .insert(activationData)
    .select()
    .single();

  if (error) {
    console.error('Error creating activation:', error);
    return null;
  }

  return data;
}

export async function removeActivation(
  licenseKey: string,
  siteUrl: string
): Promise<boolean> {
  const { error } = await supabase
    .from('activations')
    .delete()
    .eq('license_key', licenseKey)
    .eq('site_url', siteUrl);

  if (error) {
    console.error('Error removing activation:', error);
    return false;
  }

  return true;
}

export async function updateActivationCheck(
  licenseKey: string,
  siteUrl: string
): Promise<boolean> {
  const { error } = await supabase
    .from('activations')
    .update({ last_checked_at: new Date().toISOString() })
    .eq('license_key', licenseKey)
    .eq('site_url', siteUrl);

  if (error) {
    console.error('Error updating activation check:', error);
    return false;
  }

  return true;
}

// Subscription event operations
export async function createSubscriptionEvent(
  eventData: Partial<SubscriptionEvent>
): Promise<SubscriptionEvent | null> {
  const { data, error } = await supabase
    .from('subscription_events')
    .insert(eventData)
    .select()
    .single();

  if (error) {
    console.error('Error creating subscription event:', error);
    return null;
  }

  return data;
}
