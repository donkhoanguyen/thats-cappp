from fastapi import FastAPI, WebSocket, WebSocketDisconnect, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import json
from typing import List, Dict
from src.transcription.transcriber import Transcriber
from src.claim_extraction.extractor import ClaimExtractor
from src.fact_checking.checker import FactChecker

app = FastAPI()

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize services
transcriber = Transcriber()
claim_extractor = ClaimExtractor()
fact_checker = FactChecker()

# Store active WebSocket connections
active_connections: List[WebSocket] = []

async def process_audio_chunk(audio_chunk: bytes) -> Dict:
    """Process a single audio chunk through the pipeline."""
    # 1. Transcribe audio chunk
    transcription = await transcriber.transcribe_chunk(audio_chunk)
    
    # 2. Extract claims from transcription
    claims = await claim_extractor.extract_claims(transcription)
    
    # 3. Fact check each claim
    fact_check_results = []
    for claim in claims:
        result = await fact_checker.check_claim(claim)
        fact_check_results.append({
            "claim": claim,
            "fact_check": result
        })
    
    return {
        "transcription": transcription,
        "claims": claims,
        "fact_check_results": fact_check_results
    }

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    active_connections.append(websocket)
    
    try:
        while True:
            # Receive audio chunk from client
            audio_chunk = await websocket.receive_bytes()
            
            # Process the audio chunk
            results = await process_audio_chunk(audio_chunk)
            
            # Send results back to client
            await websocket.send_json(results)
            
    except WebSocketDisconnect:
        active_connections.remove(websocket)
    except Exception as e:
        print(f"Error processing audio: {str(e)}")
        await websocket.close()

@app.get("/")
async def root():
    return {
        "message": "Welcome to the Audio Processing API",
        "endpoints": {
            "websocket": "/ws - WebSocket endpoint for real-time audio processing",
            "health": "/health - Health check endpoint"
        }
    }

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "services": {
            "transcriber": "operational",
            "claim_extractor": "operational",
            "fact_checker": "operational"
        }
    } 