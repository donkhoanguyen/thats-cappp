# src/transcription/transcriber.py

import whisper
import sounddevice as sd
import numpy as np
import time

class Transcriber:
    def __init__(self, config=None, model_name="base"):
        self.config = config
        print("Transcriber initialized.")
        print(f"Loading Whisper model: {model_name}")
        self.model = whisper.load_model(model_name)

    def transcribe(self, audio_filepath):
        # print(f"Transcribing audio file: {audio_filepath}")
        # File-based transcription
        result = self.model.transcribe(audio_filepath)
        return result["text"]

    def transcribe_realtime(self, duration=20, samplerate=16000, device=None, output_markdown="transcription.md"):
        """
        Listen to the microphone in real time, transcribe in chunks, and write results to a markdown file.
        Each entry includes the start timestamp (seconds since start) and the transcribed text.
        """
        print(f"Listening to microphone (device={device}) in {duration}s chunks...")
        start_time = time.time()
        chunk_idx = 0
        with open(output_markdown, "w") as f:
            f.write("# Real-Time Transcription\n\n")
            f.write("| Start Time (s) | Transcription |\n")
            f.write("|:--------------:|:--------------|\n")
            try:
                while True:
                    chunk_start = time.time() - start_time
                    print(f"Speak now... (Chunk {chunk_idx+1}, Start: {chunk_start:.2f}s)")
                    audio = sd.rec(int(duration * samplerate), samplerate=samplerate, channels=1, dtype='float32', device=device)
                    sd.wait()
                    audio = np.squeeze(audio)
                    result = self.model.transcribe(audio, fp16=False)
                    transcription = result["text"].strip()
                    print(f"Transcription: {transcription}")
                    # Write to markdown file
                    f.write(f"| {chunk_start:.2f} | {transcription} |\n")
                    f.flush()
                    chunk_idx += 1
            except KeyboardInterrupt:
                print(f"Stopped real-time transcription. Output saved to {output_markdown}") 