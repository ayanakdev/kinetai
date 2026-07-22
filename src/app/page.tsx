"use client";

import { useState, useRef, useEffect, FormEvent, KeyboardEvent } from "react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [isTimedOut, setIsTimedOut] = useState(false);
  const [timeoutEnd, setTimeoutEnd] = useState<number | null>(null);
  const [timeoutRemaining, setTimeoutRemaining] = useState("");
  const [hasWarning, setHasWarning] = useState(false);
  const [dailyCount, setDailyCount] = useState(0);
  const [dailyReset, setDailyReset] = useState(0);
  const DAILY_LIMIT = 10;
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const saved = localStorage.getItem("kinetai-timeout");
    if (saved) {
      const end = parseInt(saved);
      if (Date.now() < end) {
        setIsTimedOut(true);
        setTimeoutEnd(end);
      } else {
        localStorage.removeItem("kinetai-timeout");
      }
    }
    const warned = localStorage.getItem("kinetai-warned");
    if (warned === "true") {
      setHasWarning(true);
    }
    const savedCount = localStorage.getItem("kinetai-daily-count");
    const savedReset = localStorage.getItem("kinetai-daily-reset");
    if (savedCount && savedReset) {
      const resetTime = parseInt(savedReset);
      if (Date.now() < resetTime) {
        setDailyCount(parseInt(savedCount));
        setDailyReset(resetTime);
      } else {
        localStorage.removeItem("kinetai-daily-count");
        localStorage.removeItem("kinetai-daily-reset");
      }
    }
  }, []);

  useEffect(() => {
    if (!timeoutEnd) return;
    const interval = setInterval(() => {
      const remaining = timeoutEnd - Date.now();
      if (remaining <= 0) {
        setIsTimedOut(false);
        setTimeoutEnd(null);
        localStorage.removeItem("kinetai-timeout");
        setTimeoutRemaining("");
      } else {
        const mins = Math.floor(remaining / 60000);
        const secs = Math.floor((remaining % 60000) / 1000);
        setTimeoutRemaining(`${mins}:${secs.toString().padStart(2, "0")}`);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [timeoutEnd]);

  const toggleTheme = () => {
    const newTheme = theme === "dark" ? "light" : "dark";
    setTheme(newTheme);
    document.documentElement.setAttribute("data-theme", newTheme);
    localStorage.setItem("kinetai-theme", newTheme);
  };

  useEffect(() => {
    const saved = localStorage.getItem("kinetai-theme");
    if (saved) {
      setTheme(saved as "dark" | "light");
      document.documentElement.setAttribute("data-theme", saved);
    }
  }, []);

  const handleSend = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading || isTimedOut) return;

    const userMessage = input.trim();

    if (dailyCount >= DAILY_LIMIT) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "You've hit your 10 message limit for today. Come back tomorrow for more vibes." },
      ]);
      return;
    }

    setInput("");
    setIsLoading(true);

    let newCount = dailyCount + 1;
    let resetTime = dailyReset;
    if (!dailyReset || Date.now() >= dailyReset) {
      resetTime = Date.now() + 24 * 60 * 60 * 1000;
      newCount = 1;
    }
    setDailyCount(newCount);
    setDailyReset(resetTime);
    localStorage.setItem("kinetai-daily-count", newCount.toString());
    localStorage.setItem("kinetai-daily-reset", resetTime.toString());

    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);

    try {
      const history = [...messages, { role: "user" as const, content: userMessage }];

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage,
          history: history.slice(-10),
          hasWarning,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.error || "Something went wrong. Check your API key quota.",
          },
        ]);
        return;
      }

      if (data.warning) {
        setHasWarning(true);
        localStorage.setItem("kinetai-warned", "true");
      }

      if (data.timedOut) {
        const end = Date.now() + data.timeoutMinutes * 60 * 1000;
        setIsTimedOut(true);
        setTimeoutEnd(end);
        localStorage.setItem("kinetai-timeout", end.toString());
      }

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.response },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Network error: ${err instanceof Error ? err.message : "try again in a sec."}`,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const adjustTextarea = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  };

  return (
    <div className="flex flex-col h-screen" style={{ backgroundColor: "var(--bg-primary)" }}>
      {/* Header */}
      <header
        className="flex items-center justify-between px-4 py-3 border-b"
        style={{
          backgroundColor: "var(--bg-secondary)",
          borderColor: "var(--border-color)",
        }}
      >
        <div className="flex items-center gap-3">
          {/* Logo */}
          <img
            src="/logo.png"
            alt="KinetAI Logo"
            className="w-9 h-9 rounded-full object-cover border border-white/10"
          />
          <div className="flex items-center gap-1.5">
            <div>
              <h1 className="text-base font-semibold leading-tight" style={{ color: "var(--text-primary)" }}>
                KinetAI
              </h1>
              <p className="text-xs leading-tight" style={{ color: "var(--text-muted)" }}>
                1.0 Free
              </p>
            </div>
            <span className="relative group cursor-help self-center">
              <svg className="w-4 h-4 opacity-50 hover:opacity-100 transition-all duration-200 hover:scale-110" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              <span className="absolute left-0 top-full mt-3 w-60 p-3 rounded-xl text-xs leading-relaxed opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-300 translate-y-1 group-hover:translate-y-0 z-50 shadow-xl" style={{ backgroundColor: "var(--bg-secondary)", color: "var(--text-secondary)", border: "1px solid var(--border-color)" }}>
                <span className="block font-semibold mb-1" style={{ color: "var(--accent)" }}>About KinetAI</span>
                nonchalant ai bestie. gen-z coded, uses slang, keeps it a buck. basically ur new homie who's lowkey smart.
              </span>
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isTimedOut && (
            <span
              className="text-xs px-2 py-1 rounded-full font-medium"
              style={{ backgroundColor: "#dc2626", color: "#fff" }}
            >
              Timeout: {timeoutRemaining}
            </span>
          )}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg transition-colors hover:opacity-80"
            style={{ backgroundColor: "var(--bg-tertiary)" }}
            title="Toggle theme"
          >
            {theme === "dark" ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="5" />
                <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>
        </div>
      </header>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto" style={{ backgroundColor: "var(--bg-primary)" }}>
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-4">
            <img
              src="/logo.png"
              alt="KinetAI Logo"
              className="w-16 h-16 rounded-full object-cover mb-4 border border-white/10"
            />
            <h2 className="text-2xl font-bold mb-2" style={{ color: "var(--text-primary)" }}>
              KinetAI 1.0 Free
            </h2>
            <p className="text-sm text-center max-w-md" style={{ color: "var(--text-muted)" }}>
              Your AI that actually gets the vibe. Ask me anything, no cap.
            </p>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto py-6 px-4">
            {messages.map((msg, i) => (
              <div
                key={i}
                className="mb-6 animate-fadeIn"
              >
                <div className="flex gap-4">
                  {msg.role === "user" ? (
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-1"
                      style={{ backgroundColor: "var(--bg-tertiary)" }}
                    >
                      U
                    </div>
                  ) : (
                    <img
                      src="/logo.png"
                      alt="KinetAI"
                      className="w-8 h-8 rounded-full object-cover flex-shrink-0 mt-1 border border-white/10"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium mb-1" style={{ color: "var(--text-muted)" }}>
                      {msg.role === "user" ? "You" : "KinetAI"}
                    </div>
                    <div className="prose max-w-none" style={{ color: "var(--text-primary)" }}>
                      <ReactMarkdown
                        components={{
                          code({ className, children, ...props }) {
                            const match = /language-(\w+)/.exec(className || "");
                            const codeStr = String(children).replace(/\n$/, "");
                            if (match) {
                              return (
                                <SyntaxHighlighter
                                  style={oneDark}
                                  language={match[1]}
                                  PreTag="div"
                                  customStyle={{
                                    borderRadius: "8px",
                                    margin: "8px 0",
                                    fontSize: "0.875rem",
                                  }}
                                >
                                  {codeStr}
                                </SyntaxHighlighter>
                              );
                            }
                            return (
                              <code className={className} {...props}>
                                {children}
                              </code>
                            );
                          },
                        }}
                      >
                        {msg.content}
                      </ReactMarkdown>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="mb-6 animate-fadeIn">
                <div className="flex gap-4">
                  <img
                    src="/logo.png"
                    alt="KinetAI"
                    className="w-8 h-8 rounded-full object-cover flex-shrink-0 border border-white/10"
                  />
                  <div className="flex items-center gap-1.5 pt-2">
                    <div
                      className="w-2 h-2 rounded-full typing-dot"
                      style={{ backgroundColor: "var(--text-muted)" }}
                    />
                    <div
                      className="w-2 h-2 rounded-full typing-dot"
                      style={{ backgroundColor: "var(--text-muted)" }}
                    />
                    <div
                      className="w-2 h-2 rounded-full typing-dot"
                      style={{ backgroundColor: "var(--text-muted)" }}
                    />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Area */}
      <div
        className="px-4 pb-4 pt-2"
        style={{ backgroundColor: "var(--bg-primary)" }}
      >
        <div className="max-w-3xl mx-auto">
          <form onSubmit={handleSend} className="relative">
            <div
              className="flex items-end rounded-2xl border"
              style={{
                backgroundColor: "var(--input-bg)",
                borderColor: isTimedOut ? "var(--border-color)" : "var(--border-color)",
              }}
            >
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  adjustTextarea();
                }}
                onKeyDown={handleKeyDown}
                placeholder={
                  isTimedOut
                    ? `Timeout active. Wait ${timeoutRemaining}...`
                    : dailyCount >= DAILY_LIMIT
                    ? "Daily limit reached. Come back tomorrow."
                    : "Type your message..."
                }
                disabled={isTimedOut || dailyCount >= DAILY_LIMIT}
                rows={1}
                className="flex-1 bg-transparent resize-none px-4 py-3 text-sm outline-none disabled:opacity-50"
                style={{
                  color: "var(--text-primary)",
                  maxHeight: "200px",
                }}
              />
              <button
                type="submit"
                disabled={!input.trim() || isLoading || isTimedOut || dailyCount >= DAILY_LIMIT}
                className="p-3 m-1 rounded-xl transition-all disabled:opacity-30 hover:opacity-90"
                style={{ backgroundColor: "var(--accent)" }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                  <path d="M22 2L11 13M22 2L15 22L11 13M22 2L2 9L11 13" />
                </svg>
              </button>
            </div>
          </form>
          <p className="text-center text-xs mt-2" style={{ color: "var(--text-muted)" }}>
            KinetAI 1.0 Free — {DAILY_LIMIT - dailyCount} messages left today
          </p>
        </div>
      </div>
    </div>
  );
}
