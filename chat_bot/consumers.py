import base64
import io
import json
import mimetypes

import aiohttp
import fitz  # for pdf files
from bs4 import BeautifulSoup
from channels.generic.websocket import AsyncWebsocketConsumer
from docx import Document

from .haystack_pipeline import (
    add_documents,
    ask_question,
    clear_documents,
    is_document_store_empty,
)
from .tts_utils import text_to_speech_bytes


class ChatConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.website_title = None  # Store website title for fallback
        self.website_desc = None  # Store website meta description for fallback
        await self.accept()

        await self.send_json("status", "WebSocket connected. Send a file or website.")

    async def disconnect(self, close_code):
        # Clear the document store when the connection closes

        clear_documents()

    async def receive(self, text_data):
        try:
            message = json.loads(text_data)
            event = message.get("event")
            data = message.get("data")
        except Exception:
            return await self.send_json("error", "Invalid message format.")

        if event == "upload":
            await self.handle_file_upload(data)
        elif event == "website":
            await self.handle_website_url(data)
        elif event == "question":
            await self.handle_question(data)
        elif event == "auth":
            await self.send_json("status", "Auth event received (placeholder)")
        else:
            await self.send_json("error", f"Unknown event: {event}")

    async def handle_file_upload(self, data):
        file_b64 = data.get("file")
        filename = data.get("filename")

        if not file_b64 or not filename:
            return await self.send_json("error", "Missing file or filename.")

        mime = mimetypes.guess_type(filename)[0]
        if mime and mime.startswith("image"):
            return await self.send_json("error", "Image files are not supported.")

        try:
            file_bytes = base64.b64decode(file_b64)
            content = await self.extract_text(file_bytes, filename)
            if content:
                add_documents(content)
                await self.send_json(
                    "status", f"{filename} indexed. You may now ask questions."
                )
            else:
                await self.send_json("error", "Could not extract text from file.")
        except Exception as e:
            await self.send_json("error", f"Error processing file: {str(e)}")

    async def handle_website_url(self, data):
        url = data.get("url")
        if not url:
            return await self.send_json("error", "No URL provided.")

        try:
            headers = {
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/120.0.0.0 Safari/537.36"
                )
            }
            async with aiohttp.ClientSession(headers=headers) as session:
                async with session.get(url) as response:
                    if response.status != 200:
                        return await self.send_json(
                            "error", f"Failed to fetch website: {response.status}"
                        )
                    html = await response.text()

            soup = BeautifulSoup(html, "html.parser")

            # Extract title
            title = (
                soup.title.string.strip() if soup.title and soup.title.string else ""
            )
            # Extract meta description
            meta_desc = ""
            desc_tag = soup.find("meta", attrs={"name": "description"})
            if desc_tag and desc_tag.get("content"):
                meta_desc = desc_tag["content"].strip()

            # Store for fallback answer
            self.website_title = title
            self.website_desc = meta_desc

            # Remove scripts/styles and extract visible text
            for tag in soup(
                ["script", "style", "noscript", "header", "footer", "nav", "form"]
            ):
                tag.decompose()

            # Try to extract from <main> or <article> if present
            main_content = ""
            main_tag = soup.find("main")
            if main_tag:
                main_content = main_tag.get_text(separator="\n", strip=True)
            article_content = ""
            article_tag = soup.find("article")
            if article_tag:
                article_content = article_tag.get_text(separator="\n", strip=True)

            # Fallback to body text
            body_content = ""
            if soup.body:
                body_content = soup.body.get_text(separator="\n", strip=True)
            else:
                body_content = soup.get_text(separator="\n", strip=True)

            # Prefer main > article > body > all text
            candidates = [main_content, article_content, body_content]
            text = next((c for c in candidates if c and len(c) > 100), None)
            if not text:
                text = soup.get_text(separator="\n", strip=True)

            # Combine all extracted content
            combined = "\n".join(filter(None, [title, meta_desc, text]))

            if not combined.strip() or len(combined.strip()) < 50:
                return await self.send_json(
                    "error", "Website contains no extractable or meaningful content."
                )

            add_documents(combined)
            await self.send_json(
                "status", "Website content indexed. You may now ask questions."
            )

        except Exception as e:
            await self.send_json(
                "error", f"Failed to fetch or process website: {str(e)}"
            )

    async def handle_question(self, data):
        if is_document_store_empty():
            return await self.send_json(
                "error", "Please upload a document or website first."
            )

        question = data.get("text")
        if not question:
            return await self.send_json("error", "No question provided.")

        try:
            answer = ask_question(question)
            # Fallback for general website questions if no answer found
            if (
                answer == "Sorry, I couldn't find an answer."
                and self.website_title is not None
                and (
                    question.strip().lower()
                    in [
                        "what is this website?",
                        "what's this website?",
                        "what site is this?",
                        "what is this site?",
                        "describe this website",
                        "describe this site",
                    ]
                )
            ):
                desc = self.website_desc or "No description available."
                fallback = f"This website is '{self.website_title}'. {desc}"
                return await self.send_json("answer", fallback)
            # await self.send_json("answer", answer)
            await self.send(bytes_data=text_to_speech_bytes(answer))
        except Exception as e:
            await self.send_json("error", f"Failed to answer: {str(e)}")

    async def send_json(self, event, data):
        await self.send(text_data=json.dumps({"event": event, "data": data}))

    async def extract_text(self, file_bytes, filename):
        file_stream = io.BytesIO(file_bytes)

        if filename.endswith(".txt"):
            return file_stream.read().decode()
        elif filename.endswith(".docx"):
            doc = Document(file_stream)
            return "\n".join(p.text for p in doc.paragraphs)
        elif filename.endswith(".pdf"):
            pdf = fitz.open(stream=file_bytes, filetype="pdf")
            return "\n".join(page.get_text() for page in pdf)
        else:
            raise Exception("Unsupported file format.")
