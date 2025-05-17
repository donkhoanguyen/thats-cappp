from fastapi import FastAPI, WebSocket, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import json
from typing import AsyncGenerator
import logging
from src.transcription.transcriber import Transcriber
from src.claim_extraction.extractor import ClaimExtractor
from src.fact_checking.checker import FactChecker

# Initialize FastAPI app
app = FastAPI(title="Audio Processing Pipeline")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize components

claim_extractor = ClaimExtractor()
fact_checker = FactChecker()
transcriber = Transcriber(claim_extractor, fact_checker)

# WebSocket endpoint for real-time audio streaming
@app.websocket("/ws/audio")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            # Receive audio data from client
            audio_data = await websocket.receive_bytes()
            
            # Process through pipeline
            transcription = await process_audio(audio_data)
            if transcription:
                # Send transcription back to client
                await websocket.send_text(json.dumps({
                    "type": "transcription",
                    "text": transcription
                }))
                
                # # Extract claims
                # claims = await extract_claims(transcription)
                # if claims:
                #     await websocket.send_text(json.dumps({
                #         "type": "claims",
                #         "claims": claims
                #     }))
                    
                #     # Fact check claims
                #     fact_check_results = await fact_check(claims)
                #     if fact_check_results:
                #         await websocket.send_text(json.dumps({
                #             "type": "fact_check",
                #             "results": fact_check_results
                #         }))
    except Exception as e:
        logging.error(f"WebSocket error: {str(e)}")
    finally:
        await websocket.close()

# # File upload endpoint for audio files
# @app.post("/upload/audio")
# async def upload_audio(file: UploadFile = File(...)):
#     try:
#         contents = await file.read()
#         # Process through pipeline
#         transcription = await process_audio(contents)
#         claims = await extract_claims(transcription) if transcription else None
#         fact_check_results = await fact_check(claims) if claims else None
        
#         return {
#             "transcription": transcription,
#             "claims": claims,
#             "fact_check_results": fact_check_results
#         }
#     except Exception as e:
#         logging.error(f"File upload error: {str(e)}")
#         return {"error": str(e)}

async def process_audio(audio_data: bytes) -> str:
    """Process audio data through the transcriber"""
    try:

        # TODO: transcription logic here
        # This is where you'll use the transcriber component
        # Use the existing transcriber instance
        result = await transcriber.transcribe_realtime(duration=30)
        return result
    except Exception as e:
        logging.error(f"Transcription error: {str(e)}")
        return None

# async def extract_claims(transcription: str) -> list:
#     """Extract claims from transcription"""
#     try:
#         # TODO: claim extraction logic here
#         # This is where you'll use the claim_extractor component
#         return ["Sample claim"]  # Replace with actual claims
#     except Exception as e:
#         logging.error(f"Claim extraction error: {str(e)}")
#         return None

# async def fact_check(claims: list) -> list:
#     """Fact check the extracted claims"""
#     try:
#         # TODO: fact checking logic here
#         # This is where you'll use the fact_checker component
#         return [{"claim": claim, "result": "Sample result"} for claim in claims]
#     except Exception as e:
#         logging.error(f"Fact checking error: {str(e)}")
#         return None

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
