from fastapi import FastAPI, WebSocket, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import json
from typing import AsyncGenerator
import logging
import av
import io
import numpy as np
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

async def process_audio_chunk(audio_array: np.ndarray) -> str:
    """Process a single chunk of audio data through the transcriber"""
    try:
        # Use the existing transcriber instance
        result = await transcriber.process_audio_chunk(audio_array)
        return result
    except Exception as e:
        logging.error(f"Transcription error: {str(e)}")
        return None

@app.websocket("/ws/start-listening")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            # Receive audio data from client
            audio_data = await websocket.receive_bytes()
            
            # Send processing status
            await websocket.send_text(json.dumps({
                "type": "status",
                "status": "processing"
            }))
            
            try:
                # Decode WebM to PCM efficiently
                with av.open(io.BytesIO(audio_data), format='webm') as container:
                    audio = container.streams.audio[0]
                    
                    # Process in chunks to manage memory
                    for frame in container.decode(audio):
                        # Convert to numpy array
                        audio_array = np.frombuffer(frame.to_ndarray(), dtype=np.float32)
                        
                        # Process with transcriber
                        result = await process_audio_chunk(audio_array)
                        if result:
                            # Send transcription back to client
                            await websocket.send_text(json.dumps({
                                "type": "transcription",
                                "text": result.get("transcription", ""),
                                "claims": result.get("claims", []),
                                "fact_check_results": result.get("fact_check_results", [])
                            }))
                            
            except Exception as e:
                logging.error(f"Error processing audio: {str(e)}")
                await websocket.send_text(json.dumps({
                    "type": "error",
                    "message": f"Error processing audio: {str(e)}"
                }))
                
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
