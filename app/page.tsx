"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";

type Role = "user" | "assistant";

type Source = {
  title: string;
  url: string;
};

type Message = {
  id: string;
  role: Role;
  content: string;
  sources?: Source[];
};

const suggestions = [
  "Quelles sont les actualités importantes aujourd’hui ?",
  "Explique-moi comment fonctionne une éclipse solaire.",
  "Quel est le dernier modèle d’iPhone ?",
  "Donne-moi les horaires d’un événement précis.",
];

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function sendMessage(rawText: string) {
    const text = rawText.trim();
    if (!text || loading) return;

    setError("");
    setInput("");

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
    };

    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages.map(({ role, content }) => ({ role, content })),
        }),
      });

      const data = (await response.json()) as {
        answer?: string;
        sources?: Source[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error || "Une erreur est survenue.");
      }

      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: data.answer || "Je n’ai pas reçu de réponse.",
          sources: data.sources || [],
        },
      ]);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Impossible de contacter l’IA.",
      );
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(input);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage(input);
    }
  }

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <div className="logo">IA</div>
          <div>
            <div className="title">IA Recherche</div>
            <div className="subtitle">Réponses basées sur Internet</div>
          </div>
        </div>

        <div className="status">
          <span className="statusDot" />
          Recherche web active
        </div>
      </header>

      <main className="main">
        <section className="messages" aria-live="polite">
          {messages.length === 0 ? (
            <div className="emptyState">
              <div className="emptyInner">
                <div className="emptyIcon">✦</div>
                <h1 className="emptyTitle">Pose ta question.</h1>
                <p className="emptyText">
                  À chaque message, l’IA utilise la recherche web pour
                  récupérer des informations récentes puis te répondre avec
                  les sources trouvées.
                </p>

                <div className="chips">
                  {suggestions.map((suggestion) => (
                    <button
                      className="chip"
                      key={suggestion}
                      type="button"
                      onClick={() => void sendMessage(suggestion)}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            messages.map((message) => (
              <div
                className={"messageRow " + message.role}
                key={message.id}
              >
                <div>
                  <div className="bubble">{message.content}</div>
                  {message.role === "assistant" &&
                    message.sources &&
                    message.sources.length > 0 && (
                      <div className="sources">
                        {message.sources.slice(0, 8).map((source) => (
                          <a
                            className="source"
                            href={source.url}
                            key={source.url}
                            target="_blank"
                            rel="noreferrer"
                            title={source.url}
                          >
                            ↗ {source.title || "Source"}
                          </a>
                        ))}
                      </div>
                    )}
                </div>
              </div>
            ))
          )}

          {loading && (
            <div className="messageRow assistant">
              <div className="bubble">
                <span className="toolState">
                  <span className="spinner" />
                  Recherche sur Internet…
                </span>
              </div>
            </div>
          )}

          {error && <div className="error">{error}</div>}
          <div ref={bottomRef} />
        </section>
      </main>

      <div className="composerDock">
        <form className="composer" onSubmit={handleSubmit}>
          <textarea
            className="input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Écris ta question…"
            rows={1}
            aria-label="Message"
          />
          <button
            className="send"
            type="submit"
            disabled={loading || !input.trim()}
            aria-label="Envoyer"
            title="Envoyer"
          >
            ↑
          </button>
        </form>
        <div className="hint">
          Entrée pour envoyer · Maj + Entrée pour aller à la ligne
        </div>
      </div>
    </div>
  );
}
