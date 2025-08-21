import io

from gtts import gTTS


def text_to_speech_bytes(text: str) -> bytes:
    tts = gTTS(text)
    audio_fp = io.BytesIO()
    tts.write_to_fp(audio_fp)
    audio_fp.seek(0)
    return audio_fp.read()
