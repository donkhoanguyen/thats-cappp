from fastapi import FastAPI, WebSocket, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import json
from typing import AsyncGenerator
import logging
from src.transcription.transcriber import Transcriber
from src.claim_extraction.gpt_extractor import ClaimExtractor
from src.fact_checking.fact_checker import FactChecker
import numpy as np

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
# here put in background tasks
@app.websocket("/ws/start-listening")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            # Receive audio data from client
            audio_data = await websocket.receive_bytes()
            
            # Convert bytes to numpy array
            audio_array = np.frombuffer(audio_data, dtype=np.float32)
            
            # Process through pipeline
            transcription = await process_audio(audio_array)
            if transcription:
                # Send transcription back to client
                await websocket.send_text(json.dumps({
                    "type": "transcription",
                    "text": transcription
                }))
                
    except Exception as e:
        logging.error(f"WebSocket error: {str(e)}")
    finally:
        await websocket.close()

async def process_audio(audio_data: np.ndarray) -> str:
    """Process audio data through the transcriber"""
    try:
        # Use the existing transcriber instance
        result = await transcriber.transcribe_realtime(duration=30)
        return result
    except Exception as e:
        logging.error(f"Transcription error: {str(e)}")
        return None

@app.websocket("/ws/stop-listening")
async def stop_listening_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        # Wait for stop command from client
        while True:
            data = await websocket.receive_text()
            command = json.loads(data)
            
            if command.get("type") == "stop":
                # Send acknowledgment that we're stopping
                await websocket.send_text(json.dumps({
                    "type": "status",
                    "status": "stopping"
                }))
                
                # Cleanup any ongoing transcription
                if transcriber:
                    await transcriber.stop_transcription()
                    
                # Send final confirmation
                await websocket.send_text(json.dumps({
                    "type": "status",
                    "status": "stopped"
                }))
                break  # Exit the loop after stopping
                
    except Exception as e:
        logging.error(f"Stop listening error: {str(e)}")
        # Send error status
        await websocket.send_text(json.dumps({
            "type": "error",
            "message": str(e)
        }))
    finally:
        await websocket.close()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
