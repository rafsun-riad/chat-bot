"use client";

import { useEffect, useRef, useState } from "react";
import { useWebSocket } from "../hooks/useWebSocket";

// Define the event/data mapping for ChatConsumer
interface ChatEvents extends Record<string, unknown> {
  status: string;
  error: string;
  answer: string;
  question: { text: string; audio?: boolean };
}

export default function Home() {
  const [messages, setMessages] = useState<
    {
      type:
        | "status"
        | "error"
        | "answer"
        | "question"
        | "upload"
        | "website"
        | "loading"
        | "audio";
      text: string;
      audioUrl?: string;
    }[]
  >([]);
  const [input, setInput] = useState("");
  const [urlInput, setUrlInput] = useState("");
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_, setIsThinking] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioResponse, setAudioResponse] = useState(false);

  const { send, subscribe, unsubscribe, connected } =
    useWebSocket<ChatEvents>("/chat/");

  // Scroll to bottom on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Subscribe to WebSocket events
  useEffect(() => {
    const removeLoading = () =>
      setMessages((msgs) => msgs.filter((msg) => msg.type !== "loading"));

    subscribe("status", (data) => {
      setMessages((msgs) => [...msgs, { type: "status", text: data }]);
    });

    subscribe("answer", (data) => {
      removeLoading();
      setMessages((msgs) => [...msgs, { type: "answer", text: data }]);
      setIsThinking(false);
    });

    subscribe("binary", (data) => {
      let blob: Blob;
      if (data instanceof ArrayBuffer) {
        blob = new Blob([data], { type: "audio/mpeg" });
      } else {
        blob = data as Blob;
      }
      const url = URL.createObjectURL(blob);

      // Find the last answer message and add audio to it
      setMessages((msgs) => {
        const lastAnswerIndex = [...msgs]
          .reverse()
          .findIndex((msg) => msg.type === "answer");
        if (lastAnswerIndex === -1) return msgs;

        const actualIndex = msgs.length - 1 - lastAnswerIndex;
        const newMsgs = [...msgs];
        newMsgs[actualIndex] = {
          ...newMsgs[actualIndex],
          audioUrl: url,
        };
        return newMsgs;
      });

      // Auto-play the audio
      setTimeout(() => {
        if (audioRef.current) {
          audioRef.current.play().catch(console.error);
        }
      }, 100);
    });

    return () => {
      unsubscribe("status");
      unsubscribe("error");
      unsubscribe("answer");
      unsubscribe("binary");
    };
  }, [subscribe, unsubscribe]);

  // Play/pause logic
  // const handlePlay = () => {
  //   if (audioRef.current) {
  //     audioRef.current.play();
  //     setIsPlaying(true);
  //   }
  // };

  // const handlePause = () => {
  //   if (audioRef.current) {
  //     audioRef.current.pause();
  //     setIsPlaying(false);
  //   }
  // };

  // Reset play state when audio ends
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onEnded = () => setIsPlaying(false);
    audio.addEventListener("ended", onEnded);
    return () => audio.removeEventListener("ended", onEnded);
  }, [audioRef]);

  // Handle sending a question
  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    setMessages((msgs) => [
      ...msgs.filter((msg) => msg.type !== "loading"),
      { type: "question", text: trimmed },
      { type: "loading", text: "Thinking..." },
    ]);
    setIsThinking(true);
    send("question", { text: trimmed, audio: audioResponse });
    setInput("");
  };

  // Handle file upload
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!/\.(txt|pdf|docx)$/i.test(file.name)) {
      setMessages((msgs) => [
        ...msgs,
        {
          type: "error",
          text: "Only .txt, .pdf, and .docx files are supported.",
        },
      ]);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",").pop();
      setMessages((msgs) => [
        ...msgs,
        { type: "upload", text: `Uploading ${file.name}...` },
      ]);
      send("upload", { file: base64, filename: file.name });
    };
    reader.readAsDataURL(file);
    // Reset file input
    e.target.value = "";
  };

  // Handle URL submit
  const handleUrlSend = () => {
    const url = urlInput.trim();
    if (!url) return;
    setMessages((msgs) => [
      ...msgs,
      { type: "website", text: `Indexing website: ${url}` },
    ]);
    send("website", { url });
    setUrlInput("");
  };

  // Handle Enter key
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleSend();
  };

  return (
    <div className="flex flex-col items-center min-h-screen bg-gray-50 dark:bg-black p-4">
      <div className="w-full max-w-xl flex flex-col flex-1 bg-white dark:bg-gray-900 rounded-lg shadow-md p-4 mt-8 mb-4 h-[70vh] overflow-y-auto">
        {messages.length === 0 && (
          <div className="text-gray-400 text-center mt-8">No messages yet.</div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={
              msg.type === "question"
                ? "text-right text-blue-700 dark:text-blue-300 my-2"
                : msg.type === "answer"
                ? "text-left text-green-700 dark:text-green-300 my-2"
                : msg.type === "error"
                ? "text-left text-red-600 dark:text-red-400 my-2"
                : msg.type === "upload"
                ? "text-left text-purple-700 dark:text-purple-300 my-2"
                : msg.type === "website"
                ? "text-left text-indigo-700 dark:text-indigo-300 my-2"
                : msg.type === "loading"
                ? "text-center text-gray-400 italic my-2 animate-pulse"
                : msg.type === "audio"
                ? "text-left my-2"
                : "text-left text-gray-500 dark:text-gray-400 my-2"
            }
          >
            {msg.type === "status" ? (
              msg.text
            ) : (
              <>
                {msg.type === "question" ? <b>You:</b> : <b>Bot:</b>} {msg.text}
              </>
            )}
            {msg.audioUrl && (
              <audio
                ref={msg.type === "answer" ? audioRef : undefined}
                src={msg.audioUrl}
                autoPlay={msg.type === "answer"}
                onEnded={() => setIsPlaying(false)}
                style={{ display: "none" }}
              />
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      <label className="flex items-center text-sm mb-3">
        <input
          type="checkbox"
          checked={audioResponse}
          onChange={(e) => setAudioResponse(e.target.checked)}
          className="mr-1"
        />
        Audio response
      </label>
      <div className="w-full max-w-xl flex gap-2 mb-2 items-center">
        <input
          className="flex-1 rounded border border-gray-300 dark:border-gray-700 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:bg-gray-800 dark:text-white"
          type="text"
          placeholder={connected ? "Type your question..." : "Connecting..."}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={!connected}
        />
        <button
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded disabled:opacity-50"
          onClick={handleSend}
          disabled={!connected || !input.trim()}
        >
          Send
        </button>
      </div>
      <div className="w-full max-w-xl flex gap-2 mb-2">
        <input
          type="file"
          accept=".txt,.pdf,.docx"
          style={{ display: "none" }}
          ref={fileInputRef}
          onChange={handleFileChange}
        />
        <button
          className="bg-purple-600 hover:bg-purple-700 text-white font-semibold px-4 py-2 rounded disabled:opacity-50"
          onClick={() => fileInputRef.current?.click()}
          disabled={!connected}
        >
          Upload File
        </button>
        <input
          className="flex-1 rounded border border-gray-300 dark:border-gray-700 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:bg-gray-800 dark:text-white"
          type="text"
          placeholder="Paste website URL..."
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          disabled={!connected}
        />
        <button
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-4 py-2 rounded disabled:opacity-50"
          onClick={handleUrlSend}
          disabled={!connected || !urlInput.trim()}
        >
          Send URL
        </button>
      </div>
      <div className="mt-2 text-xs text-gray-400">
        {connected ? "Connected" : "Connecting..."}
      </div>
    </div>
  );
}
