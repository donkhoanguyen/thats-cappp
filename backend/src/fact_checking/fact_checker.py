# src/fact_checking/checker.py
import os
import httpx
from pydantic import BaseModel
import asyncio

class ChatMessage(BaseModel):
    message: str

class FactChecker:
    def __init__(self, config=None):
        self.config = config
        # Load environment variables early, outside of async methods
        # This helps prevent file I/O during async operations
        self.api_key = os.environ.get('PERPLEXITY_API_KEY')
        if not self.api_key:
            # Only load from .env if not already in environment
            from dotenv import load_dotenv
            load_dotenv()
            self.api_key = os.environ.get('PERPLEXITY_API_KEY')
        
        print("FactChecker initialized.")

    async def check_claims(self, claim):
        url = "https://api.perplexity.ai/chat/completions"

        # Prepare the API request
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        
        data = {
            "model": "sonar-pro",
            "messages": [
                {"role": "system", "content": "You are a helpful assistant."},
                {"role": "user", "content": f"Verify this {claim} using web search. Answer as either True or False"},
            ],
            "stepwise_reasoning": True,
        }

        try:
            # Create an async HTTP client and make the request
            async with httpx.AsyncClient() as client:
                response = await client.post(url, headers=headers, json=data)
            
            # Check if the request was successful
            if response.status_code == 200:
                result = response.json()
                reply_text = result["choices"][0]["message"]["content"]
                print(f"Claim: {claim}\n")
                print("Response:", reply_text, "\n")
                return reply_text
            else:
                error_msg = f"Error: {response.status_code}"
                print(error_msg)
                print(response.text)
                return error_msg

        except Exception as e:
            error_msg = f"An error occurred: {e} here is at calling perplexity api"
            print(error_msg)
            return error_msg