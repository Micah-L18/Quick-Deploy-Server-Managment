#!/bin/bash
# Build script that properly loads .env and builds the React client

# Load environment variables from .env file at project root
if [ -f .env ]; then
    echo "Loading environment from .env..."
    # Export all variables from .env (ignoring comments and empty lines)
    set -a
    source .env
    set +a
    echo "BACKEND_URL is: $BACKEND_URL"
else
    echo "No .env file found, using defaults"
fi

# Build the React client with the backend URL
echo "Building React client..."
cd Client

# Set REACT_APP_BACKEND_URL from BACKEND_URL
export REACT_APP_BACKEND_URL="${BACKEND_URL:-http://localhost:3044}"
echo "Building with REACT_APP_BACKEND_URL=$REACT_APP_BACKEND_URL"

npm run build

echo "Build complete!"
