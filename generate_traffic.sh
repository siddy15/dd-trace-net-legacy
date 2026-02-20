#!/bin/bash

echo "🚀 Starting traffic generation for .NET Core application..."
echo "Press Ctrl+C to stop"
echo ""

# Counter for requests
counter=0

while true; do
    counter=$((counter + 1))
    
    # Random endpoints to hit
    endpoints=(
        "http://localhost:8080/"
        "http://localhost:8080/param/test${counter}"
        "http://localhost:8080/param/user${counter}"
        "http://localhost:8080/mysql"
        "http://localhost:8080/redis"
        # "http://localhost:8080/kafka/produce"
        "http://localhost:8080/api"
    )
    
    # Occasionally hit the exception endpoint
    if [ $((counter % 10)) -eq 0 ]; then
        endpoints+=("http://localhost:8080/exception")
    fi
    
    # Pick random endpoint
    random_index=$((RANDOM % ${#endpoints[@]}))
    endpoint="${endpoints[$random_index]}"
    
    # Make request
    response=$(curl -s -o /dev/null -w "%{http_code}" "$endpoint" 2>&1)
    
    # Print with color
    if [ "$response" == "200" ]; then
        echo "✅ [$counter] $endpoint - HTTP $response"
    elif [ "$response" == "500" ]; then
        echo "❌ [$counter] $endpoint - HTTP $response (Expected for /exception)"
    else
        echo "⚠️  [$counter] $endpoint - HTTP $response"
    fi
    
    # Small delay between requests
    sleep 0.5
done
