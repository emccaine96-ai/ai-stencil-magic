#!/bin/bash

echo "=========================================="
echo "   Select OpenRouter Free Model for Code X"
echo "=========================================="
echo "1) Poolside Laguna M.1 (poolside/laguna-m.1:free) - [Coding Agent]"
echo "2) Cohere North Mini Code (cohere/north-mini-code:free) - [Code & Tools]"
echo "3) OpenAI GPT-OSS 120B (openai/gpt-oss-120b:free) - [Heavy Reasoning]"
echo "4) OpenAI GPT-OSS 20B (openai/gpt-oss-20b:free) - [Fast Coding]"
echo "5) NVIDIA Nemotron 550B (nvidia/nemotron-3-ultra-550b-a55b:free) - [1M Context]"
echo "6) OpenRouter Auto Free Router (openrouter/free) - [Auto Smart Fallback]"
echo ""
read -p "Enter choice [1-6]: " choice

case $choice in
    1) MODEL="poolside/laguna-m.1:free" ;;
    2) MODEL="cohere/north-mini-code:free" ;;
    3) MODEL="openai/gpt-oss-120b:free" ;;
    4) MODEL="openai/gpt-oss-20b:free" ;;
    5) MODEL="nvidia/nemotron-3-ultra-550b-a55b:free" ;;
    6) MODEL="openrouter/free" ;;
    *) MODEL="openrouter/free" ;;
esac

mkdir -p ~/.codex
cat << CONFIG > ~/.codex/config.toml
model_provider = "openrouter"
model = "$MODEL"

[model_providers.openrouter]
name = "OpenRouter"
base_url = "https://openrouter.ai/api/v1"
env_key = "OPENROUTER_API_KEY"
wire_api = "responses"
CONFIG

echo "Configured Code X with model: $MODEL"
