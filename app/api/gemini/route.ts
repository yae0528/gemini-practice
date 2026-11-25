import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";

export async function GET() {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const list = await ai.models.list();
  const names = [];
  for await (const m of list) {
    names.push(m.name);
  }
  return NextResponse.json({ availableModels: names });
}

type Message = {
  role: "user" | "model";
  text: string;
};

export async function POST(request: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEYが設定されていません" },
        { status: 500 }
      );
    }

    const { messages } = (await request.json()) as { messages: Message[] };

    if (!messages || messages.length === 0) {
      return NextResponse.json(
        { error: "メッセージが空です" },
        { status: 400 }
      );
    }

    // Gemini APIが求める履歴形式（role と parts）に変換する
    const contents = messages.map((msg) => ({
      role: msg.role,
      parts: [{ text: msg.text }],
    }));

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents,
    });

    return NextResponse.json({ answer: response.text });
  } catch (error) {
    console.error("Gemini API Error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "不明なエラーが発生しました";
    return NextResponse.json(
      { error: `Gemini APIの呼び出しに失敗しました: ${errorMessage}` },
      { status: 500 }
    );
  }
}