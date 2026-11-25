"use client";

import { useState, useRef, useEffect } from "react";

type Message = {
  role: "user" | "model";
  text: string;
};

type ChatSession = {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: number;
};

const STORAGE_KEY = "my_gemini_chat_sessions_v1";

// 本物のGemini風の4つ星アイコン
function GeminiIcon({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="gemini-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#4285F4" />
          <stop offset="50%" stopColor="#9B72CB" />
          <stop offset="100%" stopColor="#D96570" />
        </linearGradient>
      </defs>
      <path
        d="M12 2C12.3 7.4 16.6 11.7 22 12C16.6 12.3 12.3 16.6 12 22C11.7 16.6 7.4 12.3 2 12C7.4 11.7 11.7 7.4 12 2Z"
        fill="url(#gemini-grad)"
      />
    </svg>
  );
}

// 回答内のコードブロックや太字を簡易的に見やすく整形するコンポーネント
function FormattedText({ text }: { text: string }) {
  const parts = text.split(/(```[\s\S]*?```)/g);

  return (
    <div className="space-y-3 leading-7 text-[#1f1f1f]">
      {parts.map((part, idx) => {
        if (part.startsWith("```") && part.endsWith("```")) {
          const lines = part.slice(3, -3).split("\n");
          const lang = lines[0]?.trim() || "";
          const code = (lang ? lines.slice(1) : lines).join("\n");
          return (
            <div
              key={idx}
              className="my-3 rounded-xl overflow-hidden bg-[#1e1f20] text-gray-100 text-sm"
            >
              {lang && (
                <div className="px-4 py-1.5 bg-[#2d2e30] text-xs text-gray-400 font-mono">
                  {lang}
                </div>
              )}
              <pre className="p-4 overflow-x-auto font-mono leading-relaxed">
                <code>{code}</code>
              </pre>
            </div>
          );
        }

        const boldParts = part.split(/(\*\*.*?\*\*)/g);
        return (
          <p key={idx} className="whitespace-pre-wrap">
            {boldParts.map((bPart, bIdx) => {
              if (bPart.startsWith("**") && bPart.endsWith("**")) {
                return (
                  <strong key={bIdx} className="font-semibold text-black">
                    {bPart.slice(2, -2)}
                  </strong>
                );
              }
              return bPart;
            })}
          </p>
        );
      })}
    </div>
  );
}

const SUGGESTIONS = [
  "週末に行ける東京近郊のおすすめスポットを教えて",
  "初心者向けにプログラミングの仕組みを分かりやすく説明して",
  "今日の晩ごはんの献立を3つ提案して",
];

export default function Home() {
  const [input, setInput] = useState("");
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isLoaded, setIsLoaded] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // 初回読み込み時にブラウザのlocalStorageから履歴を復元
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as ChatSession[];
        setSessions(parsed);
      }
    } catch (e) {
      console.error("履歴の読み込みに失敗:", e);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  // チャット履歴が更新されたらlocalStorageに自動保存
  useEffect(() => {
    if (!isLoaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    } catch (e) {
      console.error("履歴の保存に失敗:", e);
    }
  }, [sessions, isLoaded]);

  // 現在選択中のチャットセッションを取得
  const currentSession =
    sessions.find((s) => s.id === currentSessionId) || null;
  const messages = currentSession ? currentSession.messages : [];

  // 新しいメッセージが追加されたら自動で一番下までスクロール
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, loading]);

  const sendMessage = async (textToSend: string) => {
    if (!textToSend.trim() || loading) return;

    const userMessage: Message = { role: "user", text: textToSend };
    let targetSessionId = currentSessionId;
    let updatedMessages: Message[] = [];

    if (!targetSessionId) {
      // 新しいチャットを開始する場合
      targetSessionId = Date.now().toString();
      const autoTitle =
        textToSend.length > 24 ? `${textToSend.slice(0, 24)}...` : textToSend;
      updatedMessages = [userMessage];

      const newSession: ChatSession = {
        id: targetSessionId,
        title: autoTitle,
        messages: updatedMessages,
        updatedAt: Date.now(),
      };

      setSessions((prev) => [newSession, ...prev]);
      setCurrentSessionId(targetSessionId);
    } else {
      // 既存のチャットにメッセージを追加する場合
      const existing = sessions.find((s) => s.id === targetSessionId);
      updatedMessages = [...(existing?.messages || []), userMessage];

      setSessions((prev) =>
        prev
          .map((s) =>
            s.id === targetSessionId
              ? { ...s, messages: updatedMessages, updatedAt: Date.now() }
              : s
          )
          .sort((a, b) => b.updatedAt - a.updatedAt)
      );
    }

    setInput("");
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/gemini", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ messages: updatedMessages }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "エラーが発生しました");
      } else {
        const aiMessage: Message = { role: "model", text: data.answer };
        setSessions((prev) =>
          prev.map((s) =>
            s.id === targetSessionId
              ? {
                  ...s,
                  messages: [...s.messages, aiMessage],
                  updatedAt: Date.now(),
                }
              : s
          )
        );
      }
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const handleCopy = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  // 新しいチャット画面（ウェルカム画面）へ切り替え
  const handleNewChat = () => {
    setCurrentSessionId(null);
    setError("");
  };

  // 過去のチャットを選択
  const handleSelectSession = (id: string) => {
    setCurrentSessionId(id);
    setError("");
  };

  // 過去のチャットを削除
  const handleDeleteSession = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (currentSessionId === id) {
      setCurrentSessionId(null);
      setError("");
    }
  };

  return (
    <div className="min-h-screen bg-white text-[#1f1f1f] flex">
      {/* 左サイドバー */}
      <aside
        className={`bg-[#f0f4f9] shrink-0 flex flex-col transition-all duration-200 overflow-hidden ${
          isSidebarOpen ? "w-68 border-r border-[#e1e5ea]" : "w-0"
        }`}
      >
        <div className="w-68 flex flex-col h-screen sticky top-0 p-3">
          {/* サイドバー上部：新規チャットボタン */}
          <div className="pt-1 pb-4">
            <button
              type="button"
              onClick={handleNewChat}
              className="flex items-center gap-3 w-full px-4 py-2.5 rounded-full bg-[#dde3ea] hover:bg-[#d0d7df] text-[#1f1f1f] text-sm font-medium transition"
            >
              <span className="text-lg leading-none">＋</span>
              <span>チャットを新規作成</span>
            </button>
          </div>

          {/* 過去のチャット一覧 */}
          <div className="flex-1 overflow-y-auto space-y-1 pr-1">
            <p className="px-3 py-2 text-xs font-medium text-[#444746]">
              最近のチャット
            </p>

            {sessions.length === 0 ? (
              <p className="px-3 py-2 text-xs text-[#747775]">
                まだ履歴はありません
              </p>
            ) : (
              sessions.map((session) => {
                const isActive = session.id === currentSessionId;
                return (
                  <div
                    key={session.id}
                    onClick={() => handleSelectSession(session.id)}
                    className={`group flex items-center justify-between gap-2 px-3 py-2 rounded-full cursor-pointer text-sm transition ${
                      isActive
                        ? "bg-[#d3e3fd] text-[#041e49] font-medium"
                        : "text-[#1f1f1f] hover:bg-[#e3e8ee]"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        className="w-4 h-4 shrink-0 text-[#444746]"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M8 10h8M8 14h5m-9 6l2.5-2.5H19a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v14z"
                        />
                      </svg>
                      <span className="truncate">{session.title}</span>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => handleDeleteSession(e, session.id)}
                      title="このチャットを削除"
                      className="opacity-0 group-hover:opacity-100 p-1 rounded-full hover:bg-black/10 text-[#444746] transition shrink-0"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        className="w-3.5 h-3.5"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {/* サイドバー下部 */}
          <div className="pt-3 border-t border-[#dde3ea] px-3 py-2 text-[11px] text-[#444746]">
            ブラウザ内に履歴を自動保存中
          </div>
        </div>
      </aside>

      {/* 右側：メインコンテンツエリア */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        {/* 上部ナビゲーションバー */}
        <header className="sticky top-0 z-10 bg-white/90 backdrop-blur-sm px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* サイドバー開閉ボタン */}
            <button
              type="button"
              onClick={() => setIsSidebarOpen((prev) => !prev)}
              aria-label="メニューを開閉"
              className="p-2 rounded-full hover:bg-[#f0f4f9] text-[#444746] transition"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="w-5 h-5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            </button>

            <div className="flex items-center gap-2">
              <span className="text-xl font-medium tracking-tight text-[#1f1f1f]">
                Gemini
              </span>
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[#f0f4f9] text-[#444746]">
                3.6 Flash
              </span>
            </div>
          </div>

          {messages.length > 0 && (
            <button
              type="button"
              onClick={handleNewChat}
              className="flex items-center gap-1.5 text-sm font-medium text-[#444746] bg-[#f0f4f9] hover:bg-[#e1e5ea] px-3.5 py-1.5 rounded-full transition"
            >
              <span>＋</span>
              <span>新しいチャット</span>
            </button>
          )}
        </header>

        {/* メインの会話エリア */}
        <main className="flex-1 w-full max-w-3xl mx-auto px-4 pt-4 pb-36">
          {messages.length === 0 ? (
            /* ウェルカム画面 */
            <div className="mt-14 sm:mt-20 space-y-8">
              <div className="space-y-2">
                <h1 className="text-4xl sm:text-5xl font-medium tracking-tight bg-gradient-to-r from-[#4285F4] via-[#9B72CB] to-[#D96570] bg-clip-text text-transparent pb-1">
                  こんにちは
                </h1>
                <p className="text-2xl sm:text-3xl font-medium text-[#c4c7c5]">
                  今日はどのようなお手伝いができますか？
                </p>
              </div>

              {/* 質問の提案チップ */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4">
                {SUGGESTIONS.map((item, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => sendMessage(item)}
                    className="text-left p-4 rounded-2xl bg-[#f0f4f9] hover:bg-[#e5eaf0] transition text-sm text-[#1f1f1f] leading-relaxed flex flex-col justify-between min-h-[110px]"
                  >
                    <span>{item}</span>
                    <span className="self-end text-xs text-[#444746] mt-2">
                      ↗
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* チャット履歴 */
            <div className="space-y-8">
              {messages.map((msg, index) => (
                <div key={index}>
                  {msg.role === "user" ? (
                    <div className="flex justify-end">
                      <div className="max-w-[80%] bg-[#f0f4f9] text-[#1f1f1f] rounded-3xl rounded-tr-md px-5 py-3.5 whitespace-pre-wrap leading-7">
                        {msg.text}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-4">
                      <div className="mt-1 shrink-0">
                        <GeminiIcon className="w-7 h-7" />
                      </div>
                      <div className="flex-1 min-w-0 space-y-2">
                        <FormattedText text={msg.text} />
                        <div className="pt-1">
                          <button
                            type="button"
                            onClick={() => handleCopy(msg.text, index)}
                            className="text-xs text-[#444746] hover:bg-[#f0f4f9] px-2.5 py-1 rounded-full transition"
                          >
                            {copiedIndex === index ? "✓ コピーしました" : "コピー"}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* 読み込み中アニメーション */}
              {loading && (
                <div className="flex items-start gap-4">
                  <div className="mt-1 shrink-0 animate-spin">
                    <GeminiIcon className="w-7 h-7" />
                  </div>
                  <div className="flex-1 space-y-2.5 pt-2">
                    <div className="h-3.5 bg-gradient-to-r from-[#4285F4]/20 via-[#9B72CB]/20 to-transparent rounded-full w-3/4 animate-pulse" />
                    <div className="h-3.5 bg-gradient-to-r from-[#4285F4]/20 via-[#9B72CB]/20 to-transparent rounded-full w-1/2 animate-pulse" />
                  </div>
                </div>
              )}

              {error && (
                <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-2xl text-sm">
                  {error}
                </div>
              )}

              <div ref={bottomRef} />
            </div>
          )}
        </main>

        {/* 下部固定のカプセル型入力エリア */}
        <footer className="sticky bottom-0 bg-gradient-to-t from-white via-white to-white/0 pt-4 pb-4 px-4">
          <div className="max-w-3xl mx-auto">
            <form
              onSubmit={handleSubmit}
              className="flex items-end gap-2 bg-[#f0f4f9] focus-within:bg-white focus-within:shadow-md focus-within:ring-1 focus-within:ring-gray-200 rounded-3xl px-5 py-3 transition"
            >
              <textarea
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Gemini に相談"
                disabled={loading}
                className="flex-1 bg-transparent resize-none border-0 focus:outline-none text-[#1f1f1f] placeholder-[#444746] max-h-40 leading-6 py-1"
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                aria-label="送信"
                className={`p-2 rounded-full transition shrink-0 ${
                  input.trim() && !loading
                    ? "bg-[#0b57d0] text-white hover:bg-[#0842a0]"
                    : "text-gray-400 cursor-not-allowed"
                }`}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="w-5 h-5"
                >
                  <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                </svg>
              </button>
            </form>
            <p className="text-center text-[11px] text-[#444746] mt-2">
              Gemini は不正確な情報を表示することがあるため、生成された回答を再確認するようにしてください。
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}