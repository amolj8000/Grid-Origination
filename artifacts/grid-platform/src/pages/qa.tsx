import { useState, useRef, useEffect } from "react";
import { CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bot, User, Send, BrainCircuit, Zap, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTED = [
  "What are our top 3 ERCOT candidates by score?",
  "Explain nodal basis risk for West Texas wind",
  "Which market has the most active queue projects?",
  "What drives negative price frequency in ERCOT?",
];

export default function QACopilot() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "I'm the Grid Origination Copilot. Ask me about candidates in your pipeline, nodal pricing spreads, interconnection queue dynamics, or market-specific origination strategy across ERCOT, CAISO, and PJM.",
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMessage: Message = { role: "user", content: text };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages }),
      });

      if (!response.ok) throw new Error("Request failed");

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantContent = "";

      setMessages(prev => [...prev, { role: "assistant", content: "" }]);

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          for (const line of chunk.split("\n")) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.content) {
                  assistantContent += data.content;
                  setMessages(prev => {
                    const updated = [...prev];
                    updated[updated.length - 1] = { role: "assistant", content: assistantContent };
                    return updated;
                  });
                }
              } catch {}
            }
          }
        }
      }
    } catch {
      setMessages(prev => [
        ...prev,
        { role: "assistant", content: "Sorry, I encountered an error connecting to the AI backend. Please try again." },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  return (
    <div className="p-8 h-full flex flex-col items-center">
      <div className="w-full max-w-4xl h-full flex flex-col gap-4">
        <div className="flex items-center gap-3 shrink-0">
          <div className="p-2 bg-primary/20 rounded-md">
            <BrainCircuit className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Origination Copilot</h1>
            <p className="text-muted-foreground">Natural language interface for your market intelligence.</p>
          </div>
          <Badge variant="outline" className="ml-auto bg-card" style={{ color: "#22c55e", borderColor: "rgba(34,197,94,0.3)" }}>
            <Zap className="mr-1 h-3 w-3" style={{ color: "#22c55e" }} /> Connected
          </Badge>
        </div>

        {messages.length === 1 && (
          <div className="grid grid-cols-2 gap-2 shrink-0">
            {SUGGESTED.map((s, i) => (
              <button
                key={i}
                onClick={() => sendMessage(s)}
                className="text-left text-sm p-3 rounded-lg border border-border bg-card hover:border-primary/50 hover:bg-primary/5 transition-all text-muted-foreground hover:text-foreground"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 border border-border rounded-xl bg-card/50 overflow-hidden flex flex-col min-h-0">
          <ScrollArea className="flex-1 p-6" ref={scrollAreaRef}>
            <div className="space-y-5">
              {messages.map((msg, i) => (
                <div key={i} className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                  <div
                    className={`shrink-0 h-8 w-8 rounded-full flex items-center justify-center ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary border border-border"
                    }`}
                  >
                    {msg.role === "user" ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                  </div>
                  <div
                    className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"} max-w-[82%]`}
                  >
                    <div
                      className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground rounded-tr-sm"
                          : "bg-card border shadow-sm rounded-tl-sm"
                      }`}
                    >
                      {msg.content === "" && isLoading && i === messages.length - 1 ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      ) : (
                        msg.content
                      )}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          <CardFooter className="p-3 border-t bg-card shrink-0">
            <form onSubmit={handleSubmit} className="flex w-full items-center gap-2">
              <Input
                type="text"
                placeholder="Ask about nodal basis risk, candidate scores, interconnection queues..."
                value={input}
                onChange={e => setInput(e.target.value)}
                className="flex-1 bg-background"
                disabled={isLoading}
              />
              <Button type="submit" size="icon" disabled={!input.trim() || isLoading}>
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </form>
          </CardFooter>
        </div>
      </div>
    </div>
  );
}
