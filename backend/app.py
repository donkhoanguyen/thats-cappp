from fastapi import FastAPI, WebSocket, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import json
from typing import AsyncGenerator
import logging
from src.transcription.transcriber import Transcriber
from src.claim_extraction.gpt_extractor import ClaimExtractor
from src.fact_checking.fact_checker import FactChecker

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
@app.websocket("/ws/start-listening")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        # Start transcription in background
        asyncio.create_task(transcriber.transcribe_realtime(duration=30))
        
        chunk_idx = 0
        start_time = asyncio.get_event_loop().time()
        
        while True:
            # Receive audio data from client
            audio_data = await websocket.receive_bytes()
            
            # Calculate timing information
            current_time = asyncio.get_event_loop().time()
            chunk_start = current_time - start_time
            chunk_end = chunk_start + 30  # Assuming 30-second chunks
            
            # Process the audio data
            await transcriber.process_audio_data(
                audio_data=audio_data,
                chunk_idx=chunk_idx,
                chunk_start=chunk_start,
                chunk_end=chunk_end
            )
            
            chunk_idx += 1
            
    except Exception as e:
        logging.error(f"WebSocket error: {str(e)}")
    finally:
        await websocket.close()

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
