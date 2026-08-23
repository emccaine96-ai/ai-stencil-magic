#!/bin/bash

# AI Stencil Magic Codespaces Setup
# Configures OpenRouter free-tier models for development

set -e

echo "🎨 AI Stencil Magic Codespaces Setup"
echo "================================="

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Check for OpenRouter API key
if [ -z "$OPENROUTER_API_KEY" ]; then
  echo ""
  echo "⚠️  OPENROUTER_API_KEY not set in Codespaces secrets."
  echo "   Visit: https://github.com/settings/codespaces"
  echo "   Add secret: OPENROUTER_API_KEY = your-key-from-openrouter.ai"
  echo ""
  echo "   (You can continue developing without it, but AI features will be limited)"
else
  echo "✅ OpenRouter API key detected"
fi

# Create .env.local for local development
if [ ! -f ".env.local" ]; then
  echo ""
  echo "📝 Creating .env.local..."
  cat > .env.local << 'EOF'
# OpenRouter Configuration
OPENROUTER_API_KEY=${OPENROUTER_API_KEY}

# Supabase (update these with your project values)
VITE_SUPABASE_URL=${VITE_SUPABASE_URL:-https://your-project.supabase.co}
VITE_SUPABASE_PUBLISHABLE_KEY=${VITE_SUPABASE_PUBLISHABLE_KEY:-your-key}

# Optional: Override default models
OPENROUTER_DEFAULT_MODEL=auto
OPENROUTER_VISION_MODEL=google/gemini-2.5-flash-image
EOF
  echo "✅ .env.local created"
else
  echo "✅ .env.local already exists"
fi

echo ""
echo "🚀 Setup complete!"
echo ""
echo "Available models:"
echo "  • deepseek/deepseek-r1:free          (Deep reasoning)"
echo "  • meta-llama/llama-3.3-70b:free      (General purpose)"
echo "  • qwen/qwen-2.5-coder-32b:free       (Code specialist)"
echo ""
echo "Start development: npm run dev"
echo ""
