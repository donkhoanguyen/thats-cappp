import whisper
import sounddevice as sd
import numpy as np
import time
import asyncio
from queue import Queue
from threading import Thread
from typing import Optional, Dict, List, Any
import logging

# Assuming these are in the same relative directory or properly installed
from ..claim_extraction.gpt_extractor import ClaimExtractor
from ..fact_checking.graph_checker import graph

# Try to import performance monitoring tools
try:
    import psutil
    HAVE_PSUTIL = True
except ImportError:
    HAVE_PSUTIL = False

class AudioRecorder:
    """Handles recording audio in chunks with overlap."""
    def __init__(self, samplerate: int = 16000, device: Optional[int] = None):
        self.samplerate = samplerate
        self.device = device
        self.is_running = False

    def record_chunk(self, duration: float) -> np.ndarray:
        """Records a single audio chunk."""
        samples_to_record = int(duration * self.samplerate)
        audio = sd.rec(samples_to_record, samplerate=self.samplerate,
                      channels=1, dtype='float32', device=self.device)
        sd.wait()
        return np.squeeze(audio)

class TranscriptionProcessor:
    """Processes audio chunks: transcribes, extracts claims, and fact-checks."""
    def __init__(self, whisper_model_name: str, claim_extractor: ClaimExtractor,): # fact_checker: FactChecker):
        self.model = whisper.load_model(whisper_model_name)
        self.extractor = claim_extractor
        self.checker = graph
        self.processing_times = {
            'transcribe': [],
            'extract': [],
            'check': []
        }

    async def transcribe(self, audio: np.ndarray) -> str:
        """Transcribes the given audio chunk."""
        start_time = time.time()
        result = self.model.transcribe(audio, fp16=False)  # Consider making fp16 configurable
        transcription = result["text"].strip()
        self.processing_times['transcribe'].append(time.time() - start_time)
        return transcription

    async def extract_and_check(self, transcription: str) -> Dict[str, Any]:
        """Extracts claims and fact-checks them."""
        extract_start = time.time()
        claims_data = await self.extractor.extract_claims(transcription)
        extract_time = time.time() - extract_start
        self.processing_times['extract'].append(extract_time)

        claims = [claim.replace('.\n', '. ').strip() for claim_list in claims_data for claim in claim_list.split('. ') if claim.strip()]
        fact_check_results = []

        check_start = time.time()

        for claim in claims:

            # here change claims into inputs for langgraph graph checker
            input = {
                "claim": claim
            }

            result = await self.checker.ainvoke(input)
            fact_check_results.append(result)

        check_time = time.time() - check_start
        self.processing_times['check'].append(check_time)

        return {"claims": claims, "fact_check_results": fact_check_results}

class Transcriber:
    def __init__(self, extractor: ClaimExtractor, # checker: FactChecker,
                 config: Optional[Dict] = None, model_name: str = "base",
                 samplerate: int = 16000, device: Optional[int] = None,
                 output_markdown: str = "transcription.md"):
        self.config = config
        self.processor = TranscriptionProcessor(model_name, extractor)
        self.recorder = AudioRecorder(samplerate, device)
        self.transcriptions = []
        self.audio_queue = Queue()
        self.is_running = False
        self.output_file = None
        self.output_markdown_path = output_markdown
        self.queue_stats = {"max_size": 0, "current_size": 0}
        self.start_time = 0

    async def process_audio_chunk(self, audio_data: np.ndarray) -> Dict[str, Any]:
        """
        Process a single chunk of audio data.
        
        Args:
            audio_data: numpy array of audio data (float32, mono, 16kHz)
            
        Returns:
            Dictionary containing transcription, claims, and fact check results
        """
        try:
            # Transcribe the audio
            transcription = await self.processor.transcribe(audio_data)
            if not transcription:
                return None

            # Extract claims and fact check
            results = await self.processor.extract_and_check(transcription)
            
            return {
                "transcription": transcription,
                "claims": results["claims"],
                "fact_check_results": results["fact_check_results"]
            }
        except Exception as e:
            logging.error(f"Error processing audio chunk: {str(e)}")
            return None

    async def transcribe_realtime(self, duration: float = 30, recording_duration: float = 35):
        """
        Process audio data in real-time.
        This method is now used to process incoming audio chunks from the WebSocket.
        """
        self.is_running = True
        self.start_time = time.time()
        
        # Print system info
        self._print_system_info()
        
        # Open output file
        self.output_file = open(self.output_markdown_path, "w")
        self._write_markdown_header(recording_duration, duration, recording_duration - duration)
        
        try:
            while self.is_running:
                if not self.audio_queue.empty():
                    chunk_data = self.audio_queue.get()
                    audio = chunk_data['audio']
                    chunk_idx = chunk_data['chunk_idx']
                    chunk_start = chunk_data['start_time']
                    
                    # Process the audio chunk
                    results = await self.process_audio_chunk(audio)
                    if results:
                        # Write results to markdown
                        self._write_transcription_to_markdown(
                            chunk_start,
                            chunk_start + recording_duration,
                            results["transcription"]
                        )
                        
                        if results["claims"]:
                            self._write_claims_and_results_to_markdown(
                                chunk_idx,
                                chunk_start,
                                results["claims"],
                                results["fact_check_results"]
                            )
                else:
                    await asyncio.sleep(0.1)  # Prevent busy waiting
                    
        except Exception as e:
            logging.error(f"Error in transcribe_realtime: {str(e)}")
        finally:
            self.is_running = False
            if self.output_file:
                self.output_file.close()

    def _report_performance(self):
        """Reports on performance metrics."""
        if not self.processor.processing_times['transcribe']:
            return

        avg_transcribe = sum(self.processor.processing_times['transcribe']) / len(self.processor.processing_times['transcribe'])
        avg_extract = sum(self.processor.processing_times['extract']) / len(self.processor.processing_times['extract']) if self.processor.processing_times['extract'] else 0
        avg_check = sum(self.processor.processing_times['check']) / len(self.processor.processing_times['check']) if self.processor.processing_times['check'] else 0

        print("\n--- PERFORMANCE REPORT ---")
        print(f"Average transcription time: {avg_transcribe:.2f}s")
        print(f"Average claim extraction time: {avg_extract:.2f}s")
        print(f"Average fact checking time: {avg_check:.2f}s")
        print(f"Total average API processing time: {(avg_transcribe + avg_extract + avg_check):.2f}s")
        print(f"Current queue size: {self.audio_queue.qsize()} chunks")

        if HAVE_PSUTIL:
            print(f"CPU usage: {psutil.cpu_percent()}%")
            print(f"Memory usage: {psutil.virtual_memory().percent}%")

        if avg_transcribe + avg_extract + avg_check > 30:
            print("\nWARNING: Average processing time exceeds recording interval!")
            print("The processing queue will continue to grow unless processing speeds up.")
            print("Consider using a faster model, reducing recording quality, or increasing chunk_interval.")

        print("-------------------------\n")

    def _print_system_info(self):
        """Prints system information if psutil is available."""
        import os
        try:
            import psutil
            cpu_count = os.cpu_count()
            memory = psutil.virtual_memory()
            print(f"System info: {cpu_count} CPU cores, {memory.total / (1024**3):.1f} GB RAM")
            print(f"Current CPU usage: {psutil.cpu_percent()}%")
        except ImportError:
            print("Could not retrieve detailed system info. Consider installing psutil with: pip install psutil")

    def _write_markdown_header(self, recording_duration: float, chunk_interval: float, overlap: float):
        """Writes the markdown header to the output file."""
        self.output_file.write("# Real-Time Transcription with Overlapping Audio\n\n")
        self.output_file.write(f"Recording {recording_duration}s chunks every {chunk_interval}s (overlap: {overlap:.1f}s)\n\n")
        self.output_file.write("| Start Time (s) | End Time (s) | Transcription |\n")
        self.output_file.write("|:-------------:|:-------------:|:--------------|\n")
        self.output_file.flush()

    def _write_transcription_to_markdown(self, start_time: float, end_time: float, transcription: str):
        """Writes a single transcription to the markdown file."""
        self.output_file.write(f"| {start_time:.2f} | {end_time:.2f} | {transcription} |\n")
        self.output_file.flush()

    def _write_claims_and_results_to_markdown(self, chunk_idx: int, chunk_start: float, claims: List[str], fact_check_results: Any):
        """Writes extracted claims and fact-checking results to the markdown file."""
        self.output_file.write(f"\n## Claims from chunk {chunk_idx+1} ({chunk_start:.2f}s):\n")
        for claim in claims:
            self.output_file.write(f"- {claim}\n")
        self.output_file.write(f"\n### Fact check results for chunk {chunk_idx+1}:\n")
        self.output_file.write(f"{fact_check_results}\n\n")
        self.output_file.flush()

    async def stop_transcription(self):
        """Stop the transcription process and clean up resources."""
        self.is_running = False
        if self.output_file:
            self.output_file.close()
            self.output_file = None
        # Clear the audio queue
        while not self.audio_queue.empty():
            try:
                self.audio_queue.get_nowait()
                self.audio_queue.task_done()
            except Empty:
                break
        return True

from queue import Empty # Import here to avoid circular dependency issues