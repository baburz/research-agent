set -euo pipefail

echo "Setting up Research Agent"

# Check Python version
python_version=$(python3 --version 2>&1 | cut -d' ' -f2)
echo "   Python: $python_version"

# Create virtual environment
if [ ! -d ".venv" ]; then
    python3 -m venv .venv
    echo "   Virtual environment created"
else
    echo "   Virtual environment already exists"
fi

# Activate and install
source .venv/bin/activate
pip install --quiet --upgrade pip
pip install --quiet -r requirements.txt
echo "   Dependencies installed"

# Create logs directory
mkdir -p logs
echo "   logs/ directory ready"

echo ""
echo "Setup complete"
echo ""
