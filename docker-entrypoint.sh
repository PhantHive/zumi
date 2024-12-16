#!/bin/sh
set -e

# Map API_PORT to PORT if it exists
if [ ! -z "$API_PORT" ]; then
    export PORT=$API_PORT
fi

# Validate required environment variables
required_vars="PORT MONGODB_URI JWT_SECRET"
for var in $required_vars; do
    if [ -z "$(eval echo \$$var)" ]; then
        echo "Error: Required environment variable '$var' is not set"
        echo "Current environment variables:"
        env | grep -v "PASSWORD\|SECRET\|TOKEN"
        exit 1
    fi
done

# Log successful environment validation
echo "Environment validation successful"
echo "PORT: $PORT"
echo "MONGODB_URI: [hidden]"
echo "JWT_SECRET: [exists]"

# Execute CMD
exec "$@"