import io

import speech_recognition as sr
from gtts import gTTS
from langdetect import detect


def text_to_speech_bytes(
    text: str,
) -> bytes:
    tts = gTTS(text, slow=False, lang="bn")
    audio_fp = io.BytesIO()
    tts.write_to_fp(audio_fp)
    audio_fp.seek(0)
    return audio_fp.read()


def speech_bytes_to_text(audio_bytes: bytes, language: str = "en-US") -> str:
    recognizer = sr.Recognizer()
    with sr.AudioFile(io.BytesIO(audio_bytes)) as source:
        audio = recognizer.record(source)
    text = recognizer.recognize_google(audio, language=language)
    return text


def detect_language_from_text(text: str) -> str:
    return detect(text)
