import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# API Keys
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
WHISPER_API_KEY = os.getenv("WHISPER_API_KEY")

# Check if API keys are available
if not GROQ_API_KEY:
    raise ValueError("GROQ_API_KEY not found in environment variables")

if not WHISPER_API_KEY:
    raise ValueError("WHISPER_API_KEY not found in environment variables")

# App configuration
DEBUG = os.getenv("DEBUG", "True").lower() in ("true", "t", "1")
PORT = int(os.getenv("PORT", "5000"))