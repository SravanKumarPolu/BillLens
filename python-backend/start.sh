#!/bin/bash
# Start BillLens Python Backend

# Activate virtual environment if it exists
if [ -d "venv" ]; then
    source venv/bin/activate
fi

# Start the server
python main.py
