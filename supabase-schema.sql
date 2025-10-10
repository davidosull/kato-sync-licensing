-- KatoSync Licensing Database Schema
-- Run this in your Supabase SQL editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Licenses table
CREATE TABLE IF NOT EXISTS licenses (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    license_key VARCHAR(255) UNIQUE NOT NULL,
    order_id VARCHAR(255) NOT NULL,
    variant_id VARCHAR(255) NOT NULL,
    customer_email VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL CHECK (status IN ('active', 'expired', 'cancelled')),
    tier VARCHAR(50) NOT NULL CHECK (tier IN ('freelancer', 'agency', 'unlimited')),
    billing_cycle VARCHAR(50) NOT NULL CHECK (billing_cycle IN ('monthly', 'annual')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    subscription_id VARCHAR(255),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Activations table
CREATE TABLE IF NOT EXISTS activations (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    license_key VARCHAR(255) NOT NULL REFERENCES licenses(license_key) ON DELETE CASCADE,
    site_url TEXT NOT NULL,
    site_domain VARCHAR(255) NOT NULL,
    activated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_checked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_local BOOLEAN DEFAULT FALSE,
    UNIQUE(license_key, site_url)
);

-- Subscription events table
CREATE TABLE IF NOT EXISTS subscription_events (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    license_key VARCHAR(255) NOT NULL REFERENCES licenses(license_key) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL,
    event_data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_licenses_license_key ON licenses(license_key);
CREATE INDEX IF NOT EXISTS idx_licenses_customer_email ON licenses(customer_email);
CREATE INDEX IF NOT EXISTS idx_licenses_status ON licenses(status);
CREATE INDEX IF NOT EXISTS idx_licenses_expires_at ON licenses(expires_at);

CREATE INDEX IF NOT EXISTS idx_activations_license_key ON activations(license_key);
CREATE INDEX IF NOT EXISTS idx_activations_site_domain ON activations(site_domain);
CREATE INDEX IF NOT EXISTS idx_activations_last_checked ON activations(last_checked_at);

CREATE INDEX IF NOT EXISTS idx_subscription_events_license_key ON subscription_events(license_key);
CREATE INDEX IF NOT EXISTS idx_subscription_events_event_type ON subscription_events(event_type);
CREATE INDEX IF NOT EXISTS idx_subscription_events_created_at ON subscription_events(created_at);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to automatically update updated_at
CREATE TRIGGER update_licenses_updated_at
    BEFORE UPDATE ON licenses
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) policies
-- Enable RLS
ALTER TABLE licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE activations ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_events ENABLE ROW LEVEL SECURITY;

-- Policies for API access (adjust based on your needs)
-- For now, we'll allow all operations for authenticated users
-- In production, you might want more restrictive policies

CREATE POLICY "Allow all operations for service role" ON licenses
    FOR ALL USING (true);

CREATE POLICY "Allow all operations for service role" ON activations
    FOR ALL USING (true);

CREATE POLICY "Allow all operations for service role" ON subscription_events
    FOR ALL USING (true);

-- Sample data for testing (remove in production)
-- INSERT INTO licenses (license_key, order_id, variant_id, customer_email, status, tier, billing_cycle, expires_at)
-- VALUES
--     ('test-license-123', 'order-123', 'variant-freelancer-monthly', 'test@example.com', 'active', 'freelancer', 'monthly', NOW() + INTERVAL '1 month'),
--     ('test-license-456', 'order-456', 'variant-agency-annual', 'agency@example.com', 'active', 'agency', 'annual', NOW() + INTERVAL '1 year');
