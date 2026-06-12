import React from "react";
import { AlertTriangle, Check, Copy } from "lucide-react";

function AIOutputInspector({
  activeChat,
  dbType,
  getQueryRiskLabel,
  handleCopyToClipboard,
  copiedIndex,
  selectedChatIndex,
  executing,
  handleExecuteQuery,
}) {
  return (
    <section className="w-full md:w-[35%] bg-white border-l border-[#DDD9D2] p-5 flex flex-col overflow-y-auto h-1/2 md:h-auto">
      <span className="text-xs font-bold uppercase tracking-wider text-[#9B9589] block mb-5">
        AI Output Inspector
      </span>

      {!activeChat ? (
        <div className="flex-1 flex items-center justify-center text-center text-[#9B9589] text-sm py-12">
          Select a query response from the chat to inspect.
        </div>
      ) : activeChat.loading ? (
        <div className="flex-1 flex flex-col items-center justify-center py-12 text-center text-sm text-[#9B9589]">
          <span className="inline-block w-6 h-6 border-2 border-[#DDD9D2] border-t-[#4A7C59] rounded-full animate-spin mb-3" />
          <p>Processing prompt through safety filters and model...</p>
        </div>
      ) : (
        <div className="space-y-5 flex-1 flex flex-col">
          {/* WARNING PANEL (IF ANY) */}
          {activeChat.warnings && activeChat.warnings.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800 space-y-1.5">
              <div className="flex items-center space-x-1.5 font-bold mb-1.5">
                <AlertTriangle className="h-5 w-5" />
                <span>Query Notice</span>
              </div>
              <ul className="list-disc pl-5 space-y-1 leading-relaxed">
                {activeChat.warnings.map((warn, i) => (
                  <li key={i}>{warn}</li>
                ))}
              </ul>
            </div>
          )}

          {/* SQL GENERATION VIEW */}
          {activeChat.query &&
            (() => {
              const cleanSQL = activeChat.query
                .replace(/<[^>]*>/g, "")
                .replace(/\b\d{3}\s+\w+-\w+\b/g, "");

              const label = getQueryRiskLabel(cleanSQL, dbType);

              return (
                <div className="space-y-4 text-left">
                  <div className="bg-white border border-[#DDD9D2] rounded-xl overflow-hidden shadow-sm">
                    <div className="bg-[#F5F4F0] px-4 py-3 flex items-center justify-between border-b border-[#DDD9D2]">
                      <span className="text-[11px] font-mono text-[#9B9589] uppercase font-bold">
                        {dbType === "mongoDb" ? "MongoDB MQL" : "SQL Query"}
                      </span>
                      <button
                        onClick={() =>
                          handleCopyToClipboard(cleanSQL, selectedChatIndex)
                        }
                        className="flex items-center space-x-1 px-2.5 py-1 text-[11px] font-bold bg-white border border-[#DDD9D2] hover:bg-gray-50 text-[#252420] rounded transition-all cursor-pointer"
                      >
                        {copiedIndex === selectedChatIndex ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-[#4A7C59]" />
                            <span className="text-[#4A7C59]">Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </div>
                    <div className="bg-[#1A1A1A] text-[#e2e8f0]">
                      <pre className="p-4 text-xs font-mono leading-relaxed overflow-x-auto whitespace-pre-wrap select-all max-h-60 text-left">
                        <code>{cleanSQL}</code>
                      </pre>
                    </div>
                  </div>

                  {/* Risk Label */}
                  <div className="flex items-center justify-between bg-white border border-[#DDD9D2] rounded-xl px-4 py-3 text-left shadow-sm">
                    <span className="text-xs text-[#9B9589] font-bold uppercase tracking-wider">
                      Risk Level:
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2.5 py-1 rounded-md border ${
                        label === "SAFE"
                          ? "bg-green-100 text-green-800 border-green-200"
                          : label === "READ_ONLY"
                            ? "bg-gray-100 text-gray-800 border-gray-200"
                            : label === "MODIFIES_DATA"
                              ? "bg-amber-100 text-amber-800 border-amber-200"
                              : label === "MODIFIES_SCHEMA"
                                ? "bg-orange-100 text-orange-800 border-orange-200"
                                : "bg-red-100 text-red-800 border-red-200"
                      }`}
                    >
                      {label}
                    </span>
                  </div>

                  {/* Execution Controls */}
                  <div className="pt-2">
                    {activeChat.executed ? (
                      <div className="flex items-center justify-center space-x-2 bg-green-50 border border-green-200 text-green-700 py-3 rounded-xl text-sm font-bold uppercase tracking-wider">
                        <Check className="h-5 w-5" />
                        <span>Query Executed Successfully</span>
                      </div>
                    ) : executing ? (
                      <button
                        disabled
                        className="w-full py-3.5 rounded-xl text-sm font-bold uppercase tracking-wider text-[#9B9589] bg-[#F5F4F0] border border-[#DDD9D2] cursor-not-allowed flex items-center justify-center space-x-2"
                      >
                        <span className="w-4 h-4 border-2 border-[#9B9589] border-t-transparent rounded-full animate-spin" />
                        <span>Executing Query...</span>
                      </button>
                    ) : label === "HIGH_RISK" ? (
                      <button
                        disabled
                        className="w-full py-3.5 rounded-xl text-sm font-bold uppercase tracking-wider text-red-500 bg-red-50 border border-red-200 cursor-not-allowed flex items-center justify-center space-x-2"
                      >
                        <AlertTriangle className="h-5 w-5" />
                        <span>Execution Blocked (High Risk)</span>
                      </button>
                    ) : label === "MODIFIES_DATA" ||
                      label === "MODIFIES_SCHEMA" ? (
                      <button
                        onClick={() => handleExecuteQuery(cleanSQL)}
                        disabled={executing}
                        className="w-full py-3.5 rounded-xl text-sm font-bold uppercase tracking-wider text-white transition-all cursor-pointer bg-[#4A7C59] hover:bg-[#3d664a]"
                      >
                        Execute Query
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })()}

          {/* EXPLANATION */}
          <div className="bg-white border border-[#DDD9D2] rounded-xl p-4 space-y-2 shadow-sm text-left">
            <span className="text-[11px] font-bold text-[#9B9589] uppercase tracking-wider block">
              AI Explanation
            </span>
            <p className="text-sm text-[#252420] leading-relaxed">
              {activeChat.explanation}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

export default AIOutputInspector;
