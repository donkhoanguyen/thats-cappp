# src/fact_checking/checker.py
import os
from dotenv import load_dotenv
import requests
import json
# from fastapi import APIRouter
from pydantic import BaseModel
import httpx

class ChatMessage(BaseModel):
    message: str

class FactChecker:
    def __init__(self, config=None):
        self.config = config
        print("FactChecker initialized.")

    async def check_claims(self, claims):
        # print(f"Fact-checking claims: {claims}")
        # Return a list of (claim, result) tuples

        # Load environment variables
        load_dotenv()
        api_key = os.getenv('PERPLEXITY_API_KEY')
        url = "https://api.perplexity.ai/chat/completions"

        results = []
        for claim in claims:
            # Prepare the API request
            headers = {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json"
            }
            
            data = {
                "model": "sonar",
                "messages": [
                            {"role": "system", "content": "You are a helpful assistant."},
                            {"role": "user", "content": f"Verify this {claim} using web search. Answer as either True or False"},
                        ],
                "stepwise_reasoning": True,
            }

            try:
                # Make the API request
                response = requests.post(url, headers=headers, json=data)
                
                # Check if the request was successful
                if response.status_code == 200:
                    result = response.json()
                    reply_text = result["choices"][0]["message"]["content"]
                    print(f"Claim: {claim}\n")
                    print("Response:", reply_text, "\n")
                    results.append((claim, reply_text))
                else:
                    print(f"Error: {response.status_code}")
                    print(response.text)

            except Exception as e:
                print(f"An error occurred: {e}")
        return results