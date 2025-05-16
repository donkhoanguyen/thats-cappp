## 🏗️ Architecture

```mermaid
flowchart TD
    A[Mic or Audio Stream] --> B[Frontend]
    B <--> C(WebSocket or API)
    C --> D[FastAPI Server]
    D --> E[ASR (Whisper or Google)]
    D --> F[Claim Extraction (T5, GPT)]
    E --> G[JSON Response]
    F --> G
    G --> H[Perplexity Fact Check]
```

### Workflow

1. **Audio Input**: User speaks into a microphone or uploads an audio stream.
2. **Frontend**: Captures audio and communicates with the backend via WebSocket or API.
3. **FastAPI Server**: Orchestrates the workflow.
4. **ASR (Automatic Speech Recognition)**: Transcribes speech to text using Whisper or Google ASR.
5. **Claim Extraction**: Extracts factual claims from the transcript using models like T5 or GPT.
6. **JSON Response**: The server returns structured data (claims, transcript, etc.).
7. **Perplexity Fact Check**: Each claim is verified for factual accuracy using Perplexity. 