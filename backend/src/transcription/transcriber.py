import whisper
import sounddevice as sd
import numpy as np
import time
import asyncio
from ..claim_extraction.gpt_extractor import ClaimExtractor
from ..fact_checking.graph_checker import graph
from queue import Queue
from threading import Thread

# Try to import performance monitoring tools
try:
    import psutil
    HAVE_PSUTIL = True
except ImportError:
    HAVE_PSUTIL = False

class Transcriber:
    def __init__(self, extractor:ClaimExtractor, config=None, model_name="base",):
        self.config = config
        self.model = whisper.load_model(model_name)
        self.extractor = extractor
        self.checker = graph
        print("Transcriber initialized.")
        print(f"Loading Whisper model: {model_name}")
        self.transcriptions = []
        self.audio_queue = Queue()
        self.is_running = False
        self.output_file = None
        # For monitoring performance
        self.processing_times = {
            'transcribe': [],
            'extract': [],
            'check': []
        }

    async def transcribe_realtime(self, duration=30, recording_duration=40, samplerate=16000, device=None, output_markdown="transcription.md"):
        """
        Listen to the microphone in real time, using separate threads for recording and processing.
        Records overlapping audio chunks by recording for longer than the chunk interval.
        
        Args:
            duration: Time in seconds between the start of consecutive recordings (default: 30s)
            recording_duration: Length of each recording in seconds (default: 35s)
            samplerate: Audio sample rate
            device: Audio device to use
            output_markdown: Output file path
        """
        # For backward compatibility, use duration as chunk_interval
        chunk_interval = duration
        print(f"Setting up real-time transcription with {recording_duration}s recordings every {chunk_interval}s...")
        if recording_duration <= chunk_interval:
            print(f"Warning: Recording duration ({recording_duration}s) is not greater than chunk interval ({chunk_interval}s). No overlap will occur.")
        else:
            overlap = recording_duration - chunk_interval
            print(f"Audio chunks will overlap by {overlap:.1f}s")
            
        self.is_running = True
        start_time = time.time()
        self.queue_stats = {"max_size": 0, "current_size": 0}
        
        # Print system info
        import os
        try:
            import psutil
            cpu_count = os.cpu_count()
            memory = psutil.virtual_memory()
            print(f"System info: {cpu_count} CPU cores, {memory.total / (1024**3):.1f} GB RAM")
            print(f"Current CPU usage: {psutil.cpu_percent()}%")
            HAVE_PSUTIL = True
        except:
            print("Could not retrieve detailed system info. Consider installing psutil with: pip install psutil")
            HAVE_PSUTIL = False
        
        # Open output file
        self.output_file = open(output_markdown, "w")
        self.output_file.write("# Real-Time Transcription with Overlapping Audio\n\n")
        self.output_file.write(f"Recording {recording_duration}s chunks every {chunk_interval}s (overlap: {recording_duration - chunk_interval}s)\n\n")
        self.output_file.write("| Start Time (s) | End Time (s) | Transcription |\n")
        self.output_file.write("|:-------------:|:-------------:|:--------------|\n")
        self.output_file.flush()
        
        # Start the processing thread
        processing_thread = Thread(target=asyncio.run, args=(self._process_audio_queue(),))
        processing_thread.daemon = True
        processing_thread.start()
        
        # Determine recording parameters
        samples_to_record = int(recording_duration * samplerate)
        print(f"Each recording will capture {recording_duration:.2f}s ({samples_to_record} samples)")
        
        try:
            # Main recording loop with fixed timing
            chunk_idx = 0
            next_start_time = time.time()  # When the next chunk should start
            
            while self.is_running:
                # Calculate timing for this chunk
                current_time = time.time()
                chunk_start = current_time - start_time
                chunk_end = chunk_start + recording_duration
                
                # Update queue stats
                self.queue_stats["current_size"] = self.audio_queue.qsize()
                self.queue_stats["max_size"] = max(self.queue_stats["max_size"], self.queue_stats["current_size"])
                
                # Log status with queue information
                print(f"Recording chunk {chunk_idx+1}, Start: {chunk_start:.2f}s, End: {chunk_end:.2f}s (Queue size: {self.queue_stats['current_size']})")
                if self.queue_stats["current_size"] > 2:
                    print(f"WARNING: Processing is falling behind. Queue contains {self.queue_stats['current_size']} unprocessed chunks.")
                
                # Record audio for the full recording duration
                recording_start = time.time()
                audio = sd.rec(samples_to_record, samplerate=samplerate, 
                              channels=1, dtype='float32', device=device)
                
                # Calculate when this recording should finish
                recording_end_time = recording_start + recording_duration
                
                # Calculate when the next recording should start
                next_start_time = next_start_time + chunk_interval
                
                # Determine if we need to stop recording early to start the next chunk
                if next_start_time < recording_end_time:
                    # We need to interrupt this recording to start the next one on time
                    wait_time = next_start_time - time.time()
                    if wait_time > 0:
                        # Only wait until the next chunk should start
                        print(f"Will start next recording in {wait_time:.2f}s (before current recording completes)")
                        time.sleep(wait_time)
                        # Force stop the current recording
                        sd.stop()
                        print(f"Recording stopped early after {time.time() - recording_start:.2f}s")
                    else:
                        # We're already behind schedule
                        sd.stop()
                        print(f"Recording stopped early, system is behind schedule by {-wait_time:.2f}s")
                else:
                    # We have enough time to finish this recording before starting the next one
                    sd.wait()  # Wait for recording to complete
                    recording_time = time.time() - recording_start
                    print(f"Recording completed in {recording_time:.2f}s")
                    
                    # Sleep until it's time for the next chunk
                    sleep_time = max(0, next_start_time - time.time())
                    if sleep_time > 0:
                        print(f"Waiting {sleep_time:.2f}s until next chunk")
                        time.sleep(sleep_time)
                    else:
                        # We're behind schedule
                        print(f"WARNING: System is {-sleep_time:.2f}s behind schedule. Adjusting timing.")
                        # Reset the next start time to maintain consistent intervals
                        next_start_time = time.time() + 0.5  # Small buffer before next recording
                
                # Process the audio
                audio = np.squeeze(audio)
                
                # Queue the audio with its metadata
                self.audio_queue.put({
                    'audio': audio,
                    'chunk_idx': chunk_idx,
                    'start_time': chunk_start,
                    'end_time': chunk_start + recording_time if 'recording_time' in locals() else chunk_start + recording_duration
                })
                
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
                chunk_end = item['end_time']
                
                try:
                    # Track when processing of this chunk started
                    chunk_processing_start = time.time()
                    print(f"Processing chunk {chunk_idx+1}...")
                    
                    # Calculate time from recording to processing start
                    queue_wait_time = chunk_processing_start - chunk_start
                    if queue_wait_time > 10:  # Alert if queue delay is significant
                        print(f"WARNING: Chunk waited in queue for {queue_wait_time:.2f}s")
                    
                    # Measure transcription time
                    transcribe_start = time.time()
                    result = self.model.transcribe(audio, fp16=False)
                    transcribe_time = time.time() - transcribe_start
                    self.processing_times['transcribe'].append(transcribe_time)
                    
                    transcription = result["text"].strip()
                    self.transcriptions.append(transcription)
                    print(f"Transcription for chunk {chunk_idx+1} completed in {transcribe_time:.2f}s: {transcription}")
                    
                    # Write to markdown file
                    self.output_file.write(f"| {chunk_start:.2f} | {chunk_end:.2f} | {transcription} |\n")
                    self.output_file.flush()
                    
                    # Process with APIs
                    await self._process_api_calls(transcription, chunk_idx, chunk_start)
                    
                    # Report on performance
                    if chunk_idx > 0 and chunk_idx % 5 == 0:
                        self._report_performance()
                    
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
    
    def _report_performance(self):
        """Report on performance metrics to help diagnose issues"""
        if not self.processing_times['transcribe']:
            return
            
        avg_transcribe = sum(self.processing_times['transcribe']) / len(self.processing_times['transcribe'])
        avg_extract = sum(self.processing_times['extract']) / len(self.processing_times['extract']) if self.processing_times['extract'] else 0
        avg_check = sum(self.processing_times['check']) / len(self.processing_times['check']) if self.processing_times['check'] else 0
        
        print("\n--- PERFORMANCE REPORT ---")
        print(f"Average transcription time: {avg_transcribe:.2f}s")
        print(f"Average claim extraction time: {avg_extract:.2f}s")
        print(f"Average fact checking time: {avg_check:.2f}s")
        print(f"Total average API processing time: {(avg_transcribe + avg_extract + avg_check):.2f}s")
        print(f"Current queue size: {self.audio_queue.qsize()} chunks")
        
        if HAVE_PSUTIL:
            print(f"CPU usage: {psutil.cpu_percent()}%")
            print(f"Memory usage: {psutil.virtual_memory().percent}%")
        
        # Check if we're likely to fall behind
        if avg_transcribe + avg_extract + avg_check > 30:
            print("\nWARNING: Average processing time exceeds recording interval!")
            print("The processing queue will continue to grow unless processing speeds up")
            print("Consider using a faster model, reducing recording quality, or increasing chunk_interval")
        
        print("-------------------------\n")
    
    async def _process_api_calls(self, transcription, chunk_idx, chunk_start):
        """Process API calls for a transcribed chunk"""
        try:
            # Track when processing started
            processing_start_time = time.time()
            
            # Extract claims
            extract_start = time.time()
            claims = await self.extractor.extract_claims(transcription)
            extract_time = time.time() - extract_start
            self.processing_times['extract'].append(extract_time)
            
            claims = claims[0].replace('.\n', '. ').split('. ')
            print(f"Extracted claims from chunk {chunk_idx+1} in {extract_time:.2f}s: {claims}")
            
            # Write claims to file
            self.output_file.write(f"\nClaims from chunk {chunk_idx+1} ({chunk_start:.2f}s):\n")
            check_start = time.time()
            for claim in claims:
                self.output_file.write(f"- {claim}\n")
                self.output_file.flush()

                # here change claims into inputs for langgraph graph checker
                inputs = {
                    "claim": claim
                }
                

                # Fact check claims using the graph
                
                fact_check_results = await self.checker.ainvoke(inputs)
                self.output_file.write(f"{fact_check_results}\n")

            check_time = time.time() - check_start
            self.processing_times['check'].append(check_time)
            
            print(f"Fact-checked claims from chunk {chunk_idx+1} in {check_time:.2f}s")
            
            # # Write fact check results
            # self.output_file.write(f"\nFact check results for chunk {chunk_idx+1}:\n")
            
            
            # Calculate total processing time from the start of API processing
            api_processing_time = time.time() - processing_start_time
            
            # Calculate complete processing time from when the chunk was recorded
            total_processing_time = time.time() - chunk_start
            
            self.output_file.write(f"API processing time: {api_processing_time:.2f}s\n")
            self.output_file.write(f"Total time from recording to completion: {total_processing_time:.2f}s\n\n")
            self.output_file.flush()
            
        except Exception as e:
            print(f"API processing error for chunk {chunk_idx+1}: {str(e)}")
            if self.output_file:
                self.output_file.write(f"\nAPI error in chunk {chunk_idx+1}: {str(e)}\n")
                self.output_file.flush()