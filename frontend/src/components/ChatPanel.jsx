import React from "react";
import { MessageSquare, Send } from "lucide-react";

function ChatPanel({
  chatHistory,
  dbType,
  suggestions,
  handleAskAI,
  setSelectedChatIndex,
  selectedChatIndex,
  question,
  setQuestion,
  generating
}) {
  return (
    <section className="flex-1 flex flex-col border-r border-[#DDD9D2] overflow-hidden h-1/2 md:h-auto bg-[#F5F4F0]">
      {/* Chat Log */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {chatHistory.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center p-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-[#D4EFD9] flex items-center justify-center mb-4">
              <MessageSquare className="h-8 w-8 text-[#4A7C59] animate-pulse" />
            </div>
            <h3 className="text-lg font-bold text-[#252420] mb-1">AI SQL Copilot Active</h3>
            <p className="text-sm text-[#9B9589] max-w-sm mb-6 leading-relaxed">
              Ask your database any question in natural English. The AI will translate it and retrieve the data.
            </p>

            {/* SUGGESTION BUBBLES */}
            <div className="w-full max-w-md space-y-2">
              <span className="text-[10px] uppercase font-bold tracking-wider text-[#9B9589] block mb-2">Try asking:</span>
              {suggestions[dbType]?.map((sug, i) => (
                <button
                  key={i}
                  onClick={() => handleAskAI(null, sug)}
                  className="w-full text-left p-3.5 text-sm bg-white hover:bg-[#F5F4F0] border border-[#DDD9D2] rounded-xl transition-all cursor-pointer text-[#252420]"
                >
                  {sug}
                </button>
              ))}
            </div>
          </div>
        ) : (
          chatHistory.map((chat, idx) => (
            <div key={idx} className="space-y-3">
              {/* User Bubble */}
              <div className="flex justify-end">
                <div className="bg-[#D4EFD9] text-[#252420] rounded-2xl rounded-tr-none px-5 py-3.5 text-sm max-w-lg leading-relaxed">
                  {chat.question}
                </div>
              </div>

              {/* Loading or AI response trigger bubble */}
              <div className="flex justify-start">
                <button
                  onClick={() => setSelectedChatIndex(idx)}
                  className={`flex items-start space-x-3 text-left p-4 rounded-2xl rounded-tl-none text-sm max-w-lg transition-all cursor-pointer ${
                    selectedChatIndex === idx 
                      ? "bg-white border-2 border-[#4A7C59] shadow-sm" 
                      : "bg-white border border-[#DDD9D2] hover:bg-[#F5F4F0]"
                  }`}
                >
                  <div className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 text-[10px] font-bold ${
                    selectedChatIndex === idx ? "bg-[#4A7C59] text-white" : "bg-[#F5F4F0] text-[#9B9589]"
                  }`}>
                    AI
                  </div>
                  <div className="flex-1 min-w-0">
                    {chat.loading ? (
                      <div className="flex items-center space-x-2">
                        <span className="w-4 h-4 border-2 border-[#4A7C59] border-t-transparent rounded-full animate-spin" />
                        <span className="text-[#9B9589] font-mono text-xs">Generating SQL & scanning schema...</span>
                      </div>
                    ) : (
                      <div>
                        <span className="font-mono text-xs block text-[#252420] font-bold truncate mb-1.5">
                          {chat.query ? chat.query.substring(0, 50) + (chat.query.length > 50 ? "..." : "") : "Query empty"}
                        </span>
                        <span className="text-[#9B9589] text-xs block truncate">
                          {chat.explanation ? chat.explanation.substring(0, 60) + "..." : ""}
                        </span>
                      </div>
                    )}
                  </div>
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Chat Input form */}
      <form onSubmit={handleAskAI} className="p-5 border-t border-[#DDD9D2] bg-white">
        <div className="relative">
          <input
            type="text"
            disabled={generating}
            placeholder="Enter natural language query (e.g. 'Show orders total over 100 dollars')"
            value={question}
            onChange={e => setQuestion(e.target.value)}
            className="w-full bg-[#F5F4F0] border border-[#DDD9D2] focus:border-[#4A7C59] focus:ring-1 focus:ring-[#4A7C59] rounded-xl pl-5 pr-14 py-4 text-sm outline-none transition-all placeholder:text-[#9B9589] text-[#252420]"
          />
          <button
            type="submit"
            disabled={generating || !question.trim()}
            className="absolute right-2.5 top-2.5 p-2 bg-[#4A7C59] hover:bg-[#3d664a] disabled:bg-[#DDD9D2] disabled:text-[#9B9589] rounded-lg text-white transition-all cursor-pointer"
          >
            <Send className="h-5 w-5" />
          </button>
        </div>
      </form>
    </section>
  );
}

export default ChatPanel;
