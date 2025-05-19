import whisper
import sounddevice as sd
import numpy as np
import time
import asyncio
from queue import Queue
from threading import Thread
from typing import Optional, Dict, List, Any

# Assuming these are in the same relative directory or properly installed
from ..claim_extraction.gpt_extractor import ClaimExtractor
from ..fact_checking.fact_checker import FactChecker

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
    def __init__(self, whisper_model_name: str, claim_extractor: ClaimExtractor, fact_checker: FactChecker):
        self.model = whisper.load_model(whisper_model_name)
        self.extractor = claim_extractor
        self.checker = fact_checker
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

        check_start = time.time()
        fact_check_results = await self.checker.check_claims(claims)
        check_time = time.time() - check_start
        self.processing_times['check'].append(check_time)

        return {"claims": claims, "fact_check_results": fact_check_results}

class Transcriber:
    def __init__(self, extractor: ClaimExtractor, checker: FactChecker,
                 config: Optional[Dict] = None, model_name: str = "base",
                 samplerate: int = 16000, device: Optional[int] = None,
                 output_markdown: str = "transcription.md"):
        self.config = config
        self.processor = TranscriptionProcessor(model_name, extractor, checker)
        self.recorder = AudioRecorder(samplerate, device)
        self.transcriptions = []
        self.audio_queue = Queue()
        self.is_running = False
        self.output_file = None
        self.output_markdown_path = output_markdown
        self.queue_stats = {"max_size": 0, "current_size": 0}
        self.start_time = 0  # Initialize start time here

    async def transcribe_realtime(self, duration: float = 30, recording_duration: float = 35):
        """
        Listens to the microphone in real time, using separate threads for recording and processing.
        Records overlapping audio chunks by recording for longer than the chunk interval.

        Args:
            duration: Time in seconds between the start of consecutive recordings (default: 30s)
            recording_duration: Length of each recording in seconds (default: 35s)
        """
        chunk_interval = duration
        print(f"Setting up real-time transcription with {recording_duration}s recordings every {chunk_interval}s...")
        if recording_duration <= chunk_interval:
            print(f"Warning: Recording duration ({recording_duration}s) is not greater than chunk interval ({chunk_interval}s). No overlap will occur.")
        else:
            overlap = recording_duration - chunk_interval
            print(f"Audio chunks will overlap by {overlap:.1f}s")

        self.is_running = True
        self.start_time = time.time()

        # Print system info (moved to a utility function for better organization)
        self._print_system_info()

        # Open output file
        self.output_file = open(self.output_markdown_path, "w")
        self._write_markdown_header(recording_duration, chunk_interval, recording_duration - chunk_interval)

        # Start the processing thread
        processing_thread = Thread(target=asyncio.run, args=(self._process_audio_queue(),))
        processing_thread.daemon = True
        processing_thread.start()

        try:
            chunk_idx = 0
            next_start_time = time.time()

            while self.is_running:
                current_time = time.time()
                chunk_start = current_time - self.start_time
                chunk_end = chunk_start + recording_duration

                self.queue_stats["current_size"] = self.audio_queue.qsize()
                self.queue_stats["max_size"] = max(self.queue_stats["max_size"], self.queue_stats["current_size"])

                print(f"Recording chunk {chunk_idx+1}, Start: {chunk_start:.2f}s, End: {chunk_end:.2f}s (Queue size: {self.queue_stats['current_size']})")
                if self.queue_stats["current_size"] > 2:
                    print(f"WARNING: Processing is falling behind. Queue contains {self.queue_stats['current_size']} unprocessed chunks.")

                recording_start = time.time()
                audio = self.recorder.record_chunk(recording_duration)
                recording_time = time.time() - recording_start

                next_start_time += chunk_interval
                sleep_time = max(0, next_start_time - time.time())
                if sleep_time > 0:
                    time.sleep(sleep_time)
                else:
                    print(f"WARNING: System is {-sleep_time:.2f}s behind schedule.")
                    next_start_time = time.time() + 0.1 # Small buffer

                self.audio_queue.put({
                    'audio': audio,
                    'chunk_idx': chunk_idx,
                    'start_time': chunk_start,
                    'end_time': chunk_start + recording_time
                })

                chunk_idx += 1

        except KeyboardInterrupt:
            print("Stopping real-time transcription...")
            self.is_running = False
            processing_thread.join(timeout=5)
            if self.output_file:
                self.output_file.close()
            print(f"Transcription stopped. Output saved to {self.output_markdown_path}")

    async def _process_audio_queue(self):
        """Processes audio chunks from the queue."""
        while self.is_running or not self.audio_queue.empty():
            try:
                item = self.audio_queue.get(timeout=0.1) # Non-blocking get with a timeout
                audio = item['audio']
                chunk_idx = item['chunk_idx']
                chunk_start = item['start_time']
                chunk_end = item['end_time']

                chunk_processing_start = time.time()
                print(f"Processing chunk {chunk_idx+1}...")
                queue_wait_time = chunk_processing_start - chunk_start
                if queue_wait_time > 10:
                    print(f"WARNING: Chunk waited in queue for {queue_wait_time:.2f}s")

                transcription = await self.processor.transcribe(audio)
                self.transcriptions.append(transcription)
                print(f"Transcription for chunk {chunk_idx+1} completed in {self.processor.processing_times['transcribe'][-1]:.2f}s: {transcription}")
                self._write_transcription_to_markdown(chunk_start, chunk_end, transcription)

                processing_results = await self.processor.extract_and_check(transcription)
                claims = processing_results['claims']
                fact_check_results = processing_results['fact_check_results']

                self._write_claims_and_results_to_markdown(chunk_idx, chunk_start, claims, fact_check_results)

                if chunk_idx > 0 and chunk_idx % 5 == 0:
                    self._report_performance()

                self.audio_queue.task_done()
            except Empty:
                await asyncio.sleep(0.01) # Small sleep when queue is empty
            except Exception as e:
                print(f"Error processing audio chunk: {e}")
                if self.output_file:
                    self.output_file.write(f"\nError processing chunk: {e}\n")
                    self.output_file.flush()

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

from queue import Empty # Import here to avoid circular dependency issues