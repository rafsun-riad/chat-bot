# Project Setup and Project Work Guide

This is a simple **Chat Bot** Project. In this project user provides context in a .txt, .docx, .pdf or any bot request supported website link. Then the bot will
load the context of those into it's memory. After this user can ask questions related to the given context. The bot will try to give possbile answer if the answer is in the context.

**Please be aware of that it may download some AI models from Hugging Face to local storage using haystack for the task. So it may take some time to generate proper answer. Please be patient.**

**Also it depends on client CPU. It may take sometimes.**

## Project Setup Guide

**Python and NodeJS must be installed in your device in order to run this project**

**To set up the entire project environment:**

```bash
project-initialize.bat
```

**This project backend runs on uvicorn asgi server. For running backend**

```bash
run-uvicorn.bat
```

**For running frontend**

```bash
run-dev.bat
```

**Backend will be running on**

```bash
http://127.0.0.1:8000/
```

**Frontend will running on**

```bash
http://localhost:3000/
```

## Working in the project guide

**1. After successfully completed project setup and running open a browser. Then go to frontend URL.**

**2. When Websocket handshake completes it will ask for to give supported files or website url for context.**

**3. After successfully loading the given context it will tell user to ask questions.**

## Additional Notes

1. There are some .bat files provided to do additional tasks and make the development process easier.
2. This is a simple chat bot with a minimal LLM. So you may not find the answers less close to natural language.
3. This project depends on speed of user's internet connection and CPU. As a result sometimes it may take some times to give a answer. Please be patient!
