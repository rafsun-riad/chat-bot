"use client";

import { useEffect, useRef, useState } from "react";
import { useWebSocket } from "../hooks/useWebSocket";

// Define the event/data mapping for ChatConsumer
interface ChatEvents extends Record<string, unknown> {
  status: string;
  error: string;
  answer: string;
  question: { text: string };
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
        | "loading";
      text: string;
    }[]
  >([]);
  const [input, setInput] = useState("");
  const [urlInput, setUrlInput] = useState("");
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_, setIsThinking] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

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
    subscribe("status", (text) => {
      removeLoading();
      setMessages((msgs) => [...msgs, { type: "status", text }]);
      setIsThinking(false);
    });
    subscribe("error", (text) => {
      removeLoading();
      setMessages((msgs) => [...msgs, { type: "error", text }]);
      setIsThinking(false);
    });
    subscribe("answer", (text) => {
      removeLoading();
      setMessages((msgs) => [...msgs, { type: "answer", text }]);
      setIsThinking(false);
    });
    return () => {
      unsubscribe("status");
      unsubscribe("error");
      unsubscribe("answer");
    };
  }, [subscribe, unsubscribe]);

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
    send("question", { text: trimmed });
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
    // Reset file input so same file can be uploaded again
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
                : "text-left text-gray-500 dark:text-gray-400 my-2"
            }
          >
            {msg.type === "question" ? <b>You:</b> : null} {msg.text}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      <div className="w-full max-w-xl flex gap-2 mb-2">
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
