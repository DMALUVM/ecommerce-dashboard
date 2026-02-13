import React, { useRef, useEffect, useState } from 'react';
import { MessageSquare, X, Trash2, Send, FileText } from 'lucide-react';

const AIChatPanel = ({
  showAIChat,
  setShowAIChat,
  aiMessages,
  setAiMessages,
  aiInput,
  setAiInput,
  aiLoading,
  sendAIMessage,
  generateReport,
  aiChatModel,
  setAiChatModel,
  aiModelOptions,
}) => {
  const messagesEndRef = useRef(null);
  const [confirmingClear, setConfirmingClear] = useState(false);
  
  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [aiMessages, aiLoading]);
  
  // Reset clear confirmation when chat closes
  useEffect(() => {
    if (!showAIChat) setConfirmingClear(false);
  }, [showAIChat]);
  
  // Helper to send a suggested question directly
  const sendSuggestion = (text) => {
    setAiInput(text);
    // Use setTimeout to allow state update before sending
    setTimeout(() => {
      // sendAIMessage checks aiInput, so we need to temporarily set and call
      sendAIMessage(text);
    }, 0);
  };

  if (showAIChat) {
    return (
      <div className="fixed bottom-4 right-4 z-50 w-96 max-w-[calc(100vw-2rem)]">
        <div className="bg-slate-800 rounded-2xl border border-slate-700 shadow-2xl overflow-hidden">
          <div className="bg-gradient-to-r from-violet-600 to-indigo-600 p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                <MessageSquare className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="text-white font-semibold">AI Assistant</h3>
                <p className="text-white/70 text-xs">Ask about your business data</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {aiModelOptions && (
                <select 
                  value={aiChatModel || ''} 
                  onChange={(e) => setAiChatModel(e.target.value)}
                  className="bg-white/20 text-white text-xs rounded-lg px-2 py-1.5 border border-white/30 focus:outline-none cursor-pointer appearance-none"
                  style={{ maxWidth: '130px' }}
                >
                  {aiModelOptions.map(m => (
                    <option key={m.value} value={m.value} className="bg-slate-800 text-white">{m.label}</option>
                  ))}
                </select>
              )}
              {aiMessages.length > 0 && (
                confirmingClear ? (
                  <div className="flex items-center gap-1">
                    <button 
                      onClick={() => { setAiMessages([]); setConfirmingClear(false); }} 
                      className="px-2 py-1 bg-red-500/80 hover:bg-red-500 rounded-lg text-white text-xs font-medium"
                    >
                      Clear
                    </button>
                    <button 
                      onClick={() => setConfirmingClear(false)} 
                      className="px-2 py-1 bg-white/10 hover:bg-white/20 rounded-lg text-white text-xs"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button 
                    onClick={() => setConfirmingClear(true)} 
                    className="p-2 hover:bg-white/20 rounded-lg text-white/70 hover:text-white"
                    title="Clear chat history"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )
              )}
              <button onClick={() => setShowAIChat(false)} className="p-2 hover:bg-white/20 rounded-lg text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
          
          <div className="h-80 overflow-y-auto p-4 space-y-4">
            {aiMessages.length === 0 && (
              <div className="text-center text-slate-400 py-8">
                <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p className="text-sm">Ask me anything about your business!</p>
                <div className="mt-4 space-y-2">
                  <button onClick={() => sendSuggestion("What was my total revenue last month?")} className="block w-full text-left px-3 py-2 bg-slate-700/50 hover:bg-slate-700 rounded-lg text-xs text-slate-300 transition-colors">💡 "What was my total revenue last month?"</button>
                  <button onClick={() => sendSuggestion("Which SKU has the best profit per unit?")} className="block w-full text-left px-3 py-2 bg-slate-700/50 hover:bg-slate-700 rounded-lg text-xs text-slate-300 transition-colors">💡 "Which SKU has the best profit per unit?"</button>
                  <button onClick={() => sendSuggestion("Which SKUs are declining in profitability?")} className="block w-full text-left px-3 py-2 bg-slate-700/50 hover:bg-slate-700 rounded-lg text-xs text-slate-300 transition-colors">💡 "Which SKUs are declining in profitability?"</button>
                </div>
              </div>
            )}
            {aiMessages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-2 ${msg.role === 'user' ? 'bg-violet-600 text-white' : 'bg-slate-700 text-slate-200'}`}>
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                </div>
              </div>
            ))}
            {aiLoading && (
              <div className="flex justify-start">
                <div className="bg-slate-700 rounded-2xl px-4 py-3">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
          
          <div className="p-4 border-t border-slate-700">
            <div className="flex gap-2">
              <input
                type="text"
                value={aiInput}
                onChange={(e) => setAiInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); sendAIMessage(); } }}
                placeholder="Ask about your data..."
                className="flex-1 bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-violet-500 transition-colors"
                autoComplete="off"
              />
              <button onClick={sendAIMessage} disabled={!aiInput.trim() || aiLoading} className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 rounded-xl text-white transition-colors">
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  // Floating buttons when chat is closed
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-3">
      <button onClick={() => generateReport('weekly')} className="w-14 h-14 bg-gradient-to-r from-emerald-600 to-teal-600 rounded-full shadow-lg hover:shadow-xl hover:scale-105 transition-all flex items-center justify-center group">
        <FileText className="w-6 h-6 text-white" />
        <span className="absolute right-full mr-3 px-3 py-1 bg-slate-800 text-white text-sm rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">AI Reports</span>
      </button>
      <button onClick={() => setShowAIChat(true)} className="w-14 h-14 bg-gradient-to-r from-violet-600 to-indigo-600 rounded-full shadow-lg hover:shadow-xl hover:scale-105 transition-all flex items-center justify-center group">
        <MessageSquare className="w-6 h-6 text-white" />
        <span className="absolute right-full mr-3 px-3 py-1 bg-slate-800 text-white text-sm rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">Ask AI Assistant</span>
      </button>
    </div>
  );
};

export default AIChatPanel;
