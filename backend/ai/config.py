import os
from dotenv import load_dotenv

# Load environment variables from .env file if available
load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")

# Default Groq model names
DEFAULT_MODEL = "llama-3.3-70b-versatile"
FAST_MODEL = "llama-3.3-70b-versatile"


def get_llm(model_name: str = DEFAULT_MODEL, temperature: float = 0.2):
    """
    Returns an initialized LangChain ChatGroq instance.
    """
    from langchain_groq import ChatGroq

    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        api_key = os.getenv("GROQ_API_KEY", "")

    return ChatGroq(
        model=model_name,
        groq_api_key=api_key if api_key else None,
        temperature=temperature,
    )
