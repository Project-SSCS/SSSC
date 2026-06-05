"use client";

import { FormEvent, useEffect, useState } from "react";

type Message = {
  id: string;
  name: string;
  body: string;
  createdAt: string;
};

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [status, setStatus] = useState("Loading messages...");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function loadMessages() {
    try {
      const response = await fetch("/api/messages");
      if (!response.ok) {
        throw new Error("Unable to load messages.");
      }
      const data = (await response.json()) as { messages: Message[] };
      setMessages(data.messages);
      setStatus(data.messages.length ? "Connected to MongoDB" : "Connected. No messages yet.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to load messages.");
    }
  }

  useEffect(() => {
    void loadMessages();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setStatus("Saving message...");

    try {
      const response = await fetch("/api/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ name, body })
      });

      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error ?? "Unable to save message.");
      }

      setName("");
      setBody("");
      await loadMessages();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to save message.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen px-5 py-8 sm:px-8 lg:px-12">
      <section className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-start">
        <div className="pt-8 lg:pt-20">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-tide">
            Next.js + Tailwind + MongoDB
          </p>
          <h1 className="mt-4 max-w-2xl text-4xl font-bold leading-tight text-ink sm:text-5xl">
            A production-minded starter ready for Kubernetes and Istio.
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-8 text-slate-700">
            Submit a message through a Next.js route handler, persist it in MongoDB, and serve the app from a standalone container image behind an Istio Gateway.
          </p>
          <div className="mt-8 flex flex-wrap gap-3 text-sm font-medium text-slate-700">
            <span className="rounded-full border border-tide/25 bg-white/70 px-4 py-2">App Router</span>
            <span className="rounded-full border border-moss/25 bg-white/70 px-4 py-2">MongoDB driver</span>
            <span className="rounded-full border border-clay/25 bg-white/70 px-4 py-2">Istio ingress</span>
          </div>
        </div>

        <div className="rounded-lg border border-white/70 bg-white/85 p-5 shadow-soft backdrop-blur sm:p-6">
          <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-4">
            <div>
              <h2 className="text-xl font-semibold text-ink">Message board</h2>
              <p className="mt-1 text-sm text-slate-600">{status}</p>
            </div>
            <button
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-tide hover:text-tide"
              onClick={() => void loadMessages()}
              type="button"
            >
              Refresh
            </button>
          </div>

          <form className="mt-5 grid gap-4" onSubmit={handleSubmit}>
            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Name
              <input
                className="rounded-md border border-slate-300 bg-white px-3 py-2 outline-none transition focus:border-tide focus:ring-4 focus:ring-tide/10"
                maxLength={80}
                onChange={(event) => setName(event.target.value)}
                placeholder="Ada Lovelace"
                value={name}
              />
            </label>
            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Message
              <textarea
                className="min-h-28 resize-y rounded-md border border-slate-300 bg-white px-3 py-2 outline-none transition focus:border-tide focus:ring-4 focus:ring-tide/10"
                maxLength={500}
                onChange={(event) => setBody(event.target.value)}
                placeholder="What should this app remember?"
                value={body}
              />
            </label>
            <button
              className="rounded-md bg-ink px-4 py-3 text-sm font-bold text-white transition hover:bg-tide disabled:cursor-not-allowed disabled:bg-slate-400"
              disabled={isSubmitting || !name.trim() || !body.trim()}
              type="submit"
            >
              {isSubmitting ? "Saving..." : "Save message"}
            </button>
          </form>

          <div className="mt-6 grid gap-3">
            {messages.map((message) => (
              <article className="rounded-lg border border-slate-200 bg-slate-50 p-4" key={message.id}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-semibold text-ink">{message.name}</h3>
                  <time className="text-xs text-slate-500" dateTime={message.createdAt}>
                    {new Intl.DateTimeFormat(undefined, {
                      dateStyle: "medium",
                      timeStyle: "short"
                    }).format(new Date(message.createdAt))}
                  </time>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{message.body}</p>
              </article>
            ))}
            {!messages.length && (
              <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-600">
                Messages saved in MongoDB will appear here.
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
