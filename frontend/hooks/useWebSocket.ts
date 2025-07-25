"use client";

import Cookies from "js-cookie";
import { useCallback, useEffect, useRef, useState } from "react";

const wsBaseURL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000/ws";

type DefaultEventMap = Record<string, unknown>;

type BinaryHandler = (data: ArrayBuffer | Blob) => void;

type ListenerMap<EventMap> = Partial<{
  [K in keyof EventMap & string]: (data: EventMap[K]) => void;
}> & {
  binary?: BinaryHandler;
};

export function useWebSocket<
  EventMap extends DefaultEventMap = DefaultEventMap
>(path: string) {
  const token = Cookies.get("jwt-token");
  const socketRef = useRef<WebSocket | null>(null);
  const listenersRef = useRef<ListenerMap<EventMap>>({});
  const [connected, setConnected] = useState(false);

  function isArrayBuffer(data: unknown): data is ArrayBuffer {
    return typeof ArrayBuffer !== "undefined" && data instanceof ArrayBuffer;
  }

  function isBlob(data: unknown): data is Blob {
    return typeof Blob !== "undefined" && data instanceof Blob;
  }

  const connect = useCallback(() => {
    const url = `${wsBaseURL}${path}`;
    socketRef.current = new WebSocket(url);
    socketRef.current.binaryType = "arraybuffer";

    socketRef.current.onopen = () => {
      setConnected(true);
      if (token) {
        socketRef.current?.send(
          JSON.stringify({ event: "auth", data: { token } })
        );
      }
    };

    socketRef.current.onmessage = (event) => {
      if (typeof event.data === "string") {
        try {
          const message = JSON.parse(event.data) as {
            event: keyof EventMap & string;
            data: unknown;
          };
          const handler = listenersRef.current[message.event];
          if (handler) handler(message.data as EventMap[typeof message.event]);
        } catch (err) {
          console.error("Invalid JSON WebSocket message", err);
        }
      } else {
        const handler = listenersRef.current.binary;
        if (handler) handler(event.data as ArrayBuffer | Blob);
      }
    };

    socketRef.current.onclose = () => setConnected(false);
    socketRef.current.onerror = (err) => console.error("WS Error:", err);
  }, [path, token]);

  const send = useCallback(
    <K extends keyof EventMap & string>(event: K, data: EventMap[K]) => {
      if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN)
        return;
      if (isArrayBuffer(data) || isBlob(data)) {
        socketRef.current.send(data);
      } else {
        socketRef.current.send(JSON.stringify({ event, data }));
      }
    },
    []
  );

  // Use a single generic signature for subscribe
  function subscribe<K extends (keyof EventMap & string) | "binary">(
    event: K,
    callback: K extends keyof EventMap & string
      ? (data: EventMap[K]) => void
      : K extends "binary"
      ? BinaryHandler
      : (data: unknown) => void
  ): void {
    if (event === "binary") {
      (listenersRef.current as { binary?: BinaryHandler }).binary =
        callback as BinaryHandler;
    } else {
      (listenersRef.current as Record<string, (data: unknown) => void>)[event] =
        callback as (data: unknown) => void;
    }
  }

  // Use a single generic signature for unsubscribe
  function unsubscribe<K extends (keyof EventMap & string) | "binary">(
    event: K
  ): void {
    delete (listenersRef.current as unknown as Record<string, unknown>)[event];
  }

  useEffect(() => {
    connect();
    return () => socketRef.current?.close();
  }, [connect]);

  return { send, subscribe, unsubscribe, connected };
}
