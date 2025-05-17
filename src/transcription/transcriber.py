import whisper
import sounddevice as sd
import numpy as np
import time
import asyncio
from ..claim_extraction.extractor import ClaimExtractor
from ..fact_checking.checker import FactChecker
from queue import Queue
from threading import Thread

class Transcriber:
    def __init__(self, extractor:ClaimExtractor, checker:FactChecker,
                 config=None, model_name="base",):
        self.config = config
        self.model = whisper.load_model(model_name)
        self.extractor = extractor
        self.checker = checker
        print("Transcriber initialized.")
        print(f"Loading Whisper model: {model_name}")
        self.transcriptions = []
        self.audio_queue = Queue()
        self.is_running = False
        self.output_file = None

    async def transcribe_realtime(self, duration=30, samplerate=16000, device=None, output_markdown="transcription.md"):
        """
        Listen to the microphone in real time, using separate threads for recording and processing.
        Ensures consistent 30-second recording intervals.
        """
        print(f"Setting up real-time transcription with {duration}s chunks...")
        self.is_running = True
        start_time = time.time()
        
        # Open output file
        self.output_file = open(output_markdown, "w")
        self.output_file.write("# Real-Time Transcription\n\n")
        self.output_file.write("| Start Time (s) | Transcription |\n")
        self.output_file.write("|:--------------:|:--------------|\n")
        self.output_file.flush()
        
        # Start the processing thread
        processing_thread = Thread(target=asyncio.run, args=(self._process_audio_queue(),))
        processing_thread.daemon = True
        processing_thread.start()
        
        try:
            # Main recording loop
            chunk_idx = 0
            while self.is_running:
                # Record exact start time
                chunk_start = time.time() - start_time
                print(f"Recording chunk {chunk_idx+1}, Start: {chunk_start:.2f}s")
                
                # Start recording for exactly duration seconds
                recording_start = time.time()
                audio = sd.rec(int(duration * samplerate), samplerate=samplerate, 
                              channels=1, dtype='float32', device=device)
                sd.wait()  # Wait for recording to complete
                recording_time = time.time() - recording_start
                
                # Process the audio
                audio = np.squeeze(audio)
                
                # Queue the audio with its metadata
                self.audio_queue.put({
                    'audio': audio,
                    'chunk_idx': chunk_idx,
                    'start_time': chunk_start
                })
                
                # Calculate time until next recording should start
                elapsed = time.time() - recording_start
                sleep_time = max(0, duration - elapsed)
                
                print(f"Chunk {chunk_idx+1} recorded in {recording_time:.2f}s, sleeping for {sleep_time:.2f}s")
                if sleep_time > 0:
                    time.sleep(sleep_time)  # Sleep until it's time for the next chunk
                
                chunk_idx += 1
                
        except KeyboardInterrupt:
            print("Stopping real-time transcription...")
            self.is_running = False
            # Wait for processing to finish
            processing_thread.join(timeout=5)
            if self.output_file:
                self.output_file.close()
            print(f"Transcription stopped. Output saved to {output_markdown}")

    async def _process_audio_queue(self):
        """Process audio chunks from the queue without blocking the recording loop"""
        while self.is_running or not self.audio_queue.empty():
            if not self.audio_queue.empty():
                # Get the next audio chunk
                item = self.audio_queue.get()
                audio = item['audio']
                chunk_idx = item['chunk_idx']
                chunk_start = item['start_time']
                
                try:
                    # Transcribe the audio
                    print(f"Processing chunk {chunk_idx+1}...")
                    result = self.model.transcribe(audio, fp16=False)
                    transcription = result["text"].strip()
                    self.transcriptions.append(transcription)
                    print(f"Transcription for chunk {chunk_idx+1}: {transcription}")
                    
                    # Write to markdown file
                    self.output_file.write(f"| {chunk_start:.2f} | {transcription} |\n")
                    self.output_file.flush()
                    
                    # Process with APIs
                    await self._process_api_calls(transcription, chunk_idx, chunk_start)
                    
                except Exception as e:
                    print(f"Error processing chunk {chunk_idx+1}: {str(e)}")
                    if self.output_file:
                        self.output_file.write(f"\nError processing chunk {chunk_idx+1}: {str(e)}\n")
                        self.output_file.flush()
                
                # Mark task as done
                self.audio_queue.task_done()
            else:
                # No audio to process, sleep briefly to avoid CPU spinning
                await asyncio.sleep(0.1)
    
    async def _process_api_calls(self, transcription, chunk_idx, chunk_start):
        """Process API calls for a transcribed chunk"""
        try:
            # Extract claims
            claims = await self.extractor.extract(transcription)
            claims = claims[0].replace('.\n', '. ').split('. ')
            print(f"Extracted claims from chunk {chunk_idx+1}: {claims}")
            
            # Write claims to file
            self.output_file.write(f"\nClaims from chunk {chunk_idx+1} ({chunk_start:.2f}s):\n")
            for claim in claims:
                self.output_file.write(f"- {claim}\n")
            self.output_file.flush()
            
            # Fact check claims
            fact_check_results = await self.checker.check_claims(claims)
            print(f"Fact-checked claims from chunk {chunk_idx+1}")
            
            # Write fact check results
            self.output_file.write(f"\nFact check results for chunk {chunk_idx+1}:\n")
            self.output_file.write(f"{fact_check_results}\n")
            fact_processing_time = time.time() - chunk_start
            self.output_file.write(f"Processing time: {fact_processing_time:.2f}s\n\n")
            self.output_file.flush()
            
        except Exception as e:
            print(f"API processing error for chunk {chunk_idx+1}: {str(e)}")
            if self.output_file:
                self.output_file.write(f"\nAPI error in chunk {chunk_idx+1}: {str(e)}\n")
                self.output_file.flush()