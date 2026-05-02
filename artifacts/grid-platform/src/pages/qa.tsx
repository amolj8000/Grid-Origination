import { useState } from "react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bot, User, Send, BrainCircuit, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function QACopilot() {
  const [messages, setMessages] = useState([
    { role: "assistant", content: "I'm the Grid Origination Copilot. Ask me about any candidates in your pipeline, nodal pricing spreads, or queue trends. \n\n*Note: AI analysis is currently in disconnected mode — connect an LLM backend to activate full reasoning.*" }
  ]);
  const [input, setInput] = useState("");

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    
    setMessages(prev => [...prev, { role: "user", content: input }]);
    const currentInput = input;
    setInput("");
    
    setTimeout(() => {
      setMessages(prev => [...prev, { 
        role: "assistant", 
        content: `I received your query about "${currentInput}". Since my AI backend is not connected yet, I can't generate a real analysis. Connect an OpenAI or Anthropic key to enable live querying over your candidate database.` 
      }]);
    }, 1000);
  };

  return (
    <div className="p-8 h-full flex flex-col items-center">
      <div className="w-full max-w-4xl h-full flex flex-col">
        <div className="mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/20 rounded-md">
              <BrainCircuit className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Origination Copilot</h1>
              <p className="text-muted-foreground">Natural language interface for your market intelligence.</p>
            </div>
            <Badge variant="outline" className="ml-auto bg-card">
              <Zap className="mr-1 h-3 w-3 text-amber-500" /> Disconnected
            </Badge>
          </div>
        </div>

        <Card className="flex-1 flex flex-col bg-card/50 border-sidebar-border overflow-hidden">
          <ScrollArea className="flex-1 p-6">
            <div className="space-y-6">
              {messages.map((msg, i) => (
                <div key={i} className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                  <div className={`shrink-0 h-8 w-8 rounded-full flex items-center justify-center ${msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-secondary border border-border'}`}>
                    {msg.role === 'user' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                  </div>
                  <div className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} max-w-[80%]`}>
                    <div className={`px-4 py-3 rounded-2xl whitespace-pre-wrap text-sm ${msg.role === 'user' ? 'bg-primary text-primary-foreground rounded-tr-sm' : 'bg-card border shadow-sm rounded-tl-sm'}`}>
                      {msg.content}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
          <CardFooter className="p-4 border-t bg-card">
            <form onSubmit={handleSend} className="flex w-full items-center space-x-2">
              <Input 
                type="text" 
                placeholder="Ask about nodal basis risk, candidate scores, or interconnection queues..." 
                value={input}
                onChange={(e) => setInput(e.target.value)}
                className="flex-1 bg-background"
              />
              <Button type="submit" size="icon" disabled={!input.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
