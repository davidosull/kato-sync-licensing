#!/bin/bash

# Test script for the keep-alive endpoint
# Run this locally to test the endpoint before deploying

echo "Testing keep-alive endpoint..."

# Get the local development URL
LOCAL_URL="http://localhost:3000/api/keep-alive"

# Test the endpoint
echo "Making request to: $LOCAL_URL"
response=$(curl -s -w "\n%{http_code}" "$LOCAL_URL")

# Split response and status code
http_code=$(echo "$response" | tail -n1)
response_body=$(echo "$response" | head -n -1)

echo "HTTP Status: $http_code"
echo "Response: $response_body"

if [ "$http_code" -eq 200 ]; then
    echo "✅ Keep-alive endpoint is working correctly!"
else
    echo "❌ Keep-alive endpoint returned error status: $http_code"
    exit 1
fi
