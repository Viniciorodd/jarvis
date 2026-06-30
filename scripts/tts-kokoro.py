# tts-kokoro.py — Jarvis's FREE local voice. A tiny HTTP server around Kokoro (kokoro-onnx): no API key,
# no monthly fee, fully offline. The companion's /api/tts calls this first; ElevenLabs becomes optional.
#
# One-time setup:
#   pip install kokoro-onnx soundfile
#   # model files (~340MB total) — download once into the repo root (or set KOKORO_MODEL/KOKORO_VOICES):
#   #   kokoro-v1.0.onnx   + voices-v1.0.bin   (github.com/thewh1teagle/kokoro-onnx releases)
# Run:  python scripts/tts-kokoro.py     (Jarvis's launcher starts it automatically)
#
# POST /tts {"text": "...", "voice": "af_heart"}  ->  audio/wav
# Voices: af_heart, af_bella, am_michael, bm_george, … (see kokoro-onnx docs).

import json, io, os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(os.environ.get('KOKORO_PORT', '8880'))
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODEL = os.environ.get('KOKORO_MODEL', os.path.join(HERE, 'kokoro-v1.0.onnx'))
VOICES = os.environ.get('KOKORO_VOICES', os.path.join(HERE, 'voices-v1.0.bin'))
DEFAULT_VOICE = os.environ.get('KOKORO_VOICE', 'af_heart')

try:
    import soundfile as sf
    from kokoro_onnx import Kokoro
except Exception as e:
    raise SystemExit(f'kokoro-onnx not installed — run: pip install kokoro-onnx soundfile  ({e})')

if not (os.path.exists(MODEL) and os.path.exists(VOICES)):
    raise SystemExit(f'Kokoro model files missing.\n  expected: {MODEL}\n            {VOICES}\n  download once from github.com/thewh1teagle/kokoro-onnx releases (kokoro-v1.0.onnx + voices-v1.0.bin).')

kok = Kokoro(MODEL, VOICES)

class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _audio(self, text, voice):
        samples, sr = kok.create(text, voice=voice, speed=1.0, lang='en-us')
        buf = io.BytesIO(); sf.write(buf, samples, sr, format='WAV')
        data = buf.getvalue()
        self.send_response(200)
        self.send_header('content-type', 'audio/wav')
        self.send_header('content-length', str(len(data)))
        self.send_header('access-control-allow-origin', '*')
        self.end_headers(); self.wfile.write(data)

    def do_GET(self):
        if self.path.rstrip('/') == '/health':
            self.send_response(200); self.end_headers(); self.wfile.write(b'ok'); return
        self.send_response(404); self.end_headers()

    def do_POST(self):
        if self.path.rstrip('/') not in ('/tts', '/v1/audio/speech'):
            self.send_response(404); self.end_headers(); return
        try:
            n = int(self.headers.get('content-length', 0) or 0)
            body = json.loads(self.rfile.read(n) or b'{}')
            text = (body.get('text') or body.get('input') or '').strip()
            voice = body.get('voice') or DEFAULT_VOICE
            if not text:
                self.send_response(400); self.end_headers(); self.wfile.write(b'no text'); return
            self._audio(text[:1200], voice)
        except Exception as e:
            self.send_response(500); self.end_headers()
            try: self.wfile.write(str(e).encode())
            except Exception: pass

print(f'Kokoro TTS (free, local) on http://127.0.0.1:{PORT}  ·  voice {DEFAULT_VOICE}', flush=True)
ThreadingHTTPServer(('127.0.0.1', PORT), H).serve_forever()
