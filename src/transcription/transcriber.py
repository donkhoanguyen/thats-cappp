# src/transcription/transcriber.py

import whisper
import sounddevice as sd
import numpy as np

class Transcriber:
    def __init__(self, config=None, model_name="base"):
        self.config = config
        print("Transcriber initialized.")
        print(f"Loading Whisper model: {model_name}")
        self.model = whisper.load_model(model_name)

    def transcribe(self, audio_filepath):
        print(f"Transcribing audio file: {audio_filepath}")
        # File-based transcription
        result = self.model.transcribe(audio_filepath)
        return result["text"]

    def transcribe_realtime(self, duration=5, samplerate=16000, device=None):
        """
        Listen to the microphone in real time, transcribe in chunks, and print results.
        duration: length of each audio chunk in seconds
        samplerate: audio sample rate (Whisper expects 16000 Hz)
        device: microphone device index (None for default)
        """
        print(f"Listening to microphone (device={device}) in {duration}s chunks...")
        try:
            while True:
                print("Speak now...")
                audio = sd.rec(int(duration * samplerate), samplerate=samplerate, channels=1, dtype='float32', device=device)
                sd.wait()
                audio = np.squeeze(audio)
                # Pass float32 audio directly to Whisper
                result = self.model.transcribe(audio, fp16=False)
                print("Transcription:", result["text"])
        except KeyboardInterrupt:
            print("Stopped real-time transcription.") 