#!/bin/bash
# Run dev server with verbose logging to file

# Ensure logs directory exists
mkdir -p logs

# Clear old log
echo "Starting debug session at $(date)" > logs/debug.log

# Run npm run dev and pipe output to both console and file
# We use 'tee' to see it in the terminal AND save it to file
# 2>&1 redirects stderr to stdout so we capture errors too
echo "Starting application..."
npm run dev 2>&1 | tee -a logs/debug.log
