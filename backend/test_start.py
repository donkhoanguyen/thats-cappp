import asyncio
import websockets
import requests
import json

# For WebSocket streaming
async def stream_audio():
    uri = "ws://localhost:8000/ws/start-listening"
    async with websockets.connect(uri) as websocket:
        # Simulate sending audio data (replace with your actual audio data)
        audio_data = b"your_audio_data_here"
        await websocket.send(audio_data)
        
        # Listen for responses
        while True:
            try:
                response = await websocket.recv()
                data = json.loads(response)
                
                if data["type"] == "transcription":
                    print(f"Transcription: {data['text']}")
                elif data["type"] == "claims":
                    print(f"Claims: {data['claims']}")
                elif data["type"] == "fact_check":
                    print(f"Fact Check Results: {data['results']}")
            except websockets.exceptions.ConnectionClosed:
                break

# # For file upload
# def upload_audio_file(file_path):
#     url = "http://localhost:8000/upload/audio"
#     with open(file_path, 'rb') as f:
#         files = {'file': f}
#         response = requests.post(url, files=files)
#         return response.json()

# Example usage
if __name__ == "__main__":
    # For WebSocket streaming
    asyncio.run(stream_audio())
    
    # # For file upload
    # results = upload_audio_file("path/to/your/audio/file.mp3")
    # print("Upload results:", results)