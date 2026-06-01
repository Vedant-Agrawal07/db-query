import { useState, useEffect } from "react";
import "./App.css";

// Helper to highlight SQL keywords and strings for presentation
const highlightQuery = (query, dbType) => {
  if (!query) return "";
  let escaped = query
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  if (dbType === "mongoDb") {
    return escaped
      .replace(/(db\.[a-zA-Z0-9_]+)/g, '<span class="text-teal-400">$1</span>')
      .replace(/\b(find|aggregate|countDocuments|limit|project|match|group|sort)\b/g, '<span class="text-violet-400">$1</span>')
      .replace(/(['"].*?['"])/g, '<span class="text-emerald-400">$1</span>')
      .replace(/\b(\d+)\b/g, '<span class="text-amber-400">$1</span>');
  }

  // Tokenize by string literals first to prevent matching keywords/numbers inside string values
  const parts = [];
  const stringRegex = /('[^']*'|"[^"]*")/g;
  let lastIndex = 0;
  let match;

  while ((match = stringRegex.exec(escaped)) !== null) {
    parts.push({
      type: "sql",
      text: escaped.substring(lastIndex, match.index)
    });
    parts.push({
      type: "string",
      text: match[0]
    });
    lastIndex = stringRegex.lastIndex;
  }
  parts.push({
    type: "sql",
    text: escaped.substring(lastIndex)
  });

  const keywords = new Set([
    "SELECT", "FROM", "WHERE", "JOIN", "ON", "AND", "OR", "GROUP BY", "ORDER BY",
    "LIMIT", "HAVING", "AS", "INNER", "LEFT", "RIGHT", "OUTER", "WITH", "UNION",
    "IN", "IS", "NULL", "NOT", "EXISTS", "BETWEEN", "LIKE", "COUNT", "SUM", "AVG", "MIN", "MAX",
    "CREATE", "TABLE", "INSERT", "INTO", "UPDATE", "SET", "DELETE", "DROP", "ALTER", "TRUNCATE",
    "VALUES", "PRIMARY", "KEY", "FOREIGN", "REFERENCES", "INDEX", "VIEW", "DATABASE", "DEFAULT"
  ]);

  const highlightedParts = parts.map(part => {
    if (part.type === "string") {
      return `<span class="text-emerald-400">${part.text}</span>`;
    }

    let text = part.text;
    // Highlight keywords
    text = text.replace(/\b[a-zA-Z_][a-zA-Z0-9_]*\b/g, (word) => {
      const upperWord = word.toUpperCase();
      if (keywords.has(upperWord)) {
        return `<span class="text-indigo-400 font-semibold">${word}</span>`;
      }
      return word;
    });

    // Highlight numbers
    text = text.replace(/\b(\d+)\b/g, '<span class="text-amber-400">$1</span>');

    return text;
  });

  return highlightedParts.join("");
};

function App() {
  // Connection State
  const [isConnected, setIsConnected] = useState(false);
  const [dbType, setDbType] = useState("mySql"); // 'mySql', 'postgres', 'mongoDb'
  const [threadId, setThreadId] = useState("");
  
  // Connection Inputs
  const [connectionString, setConnectionString] = useState("");
  const [database, setDatabase] = useState("");

  // Helper to extract database name from URI for visual display
  const getDbNameFromUri = (uriStr) => {
    if (!uriStr) return "";
    try {
      // Handles standard URIs: protocol://user:pass@host:port/dbname
      const cleanUri = uriStr.split("?")[0];
      const parts = cleanUri.split("/");
      const lastPart = parts[parts.length - 1];
      return lastPart && !lastPart.includes("@") ? lastPart : "";
    } catch (e) {
      return "";
    }
  };

  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState("");

  // Schema state
  const [schema, setSchema] = useState([]); // [{ table: string, columns: string[] }]
  const [loadingSchema, setLoadingSchema] = useState(false);
  const [expandedTables, setExpandedTables] = useState({});

  // Chat State
  const [question, setQuestion] = useState("");
  const [chatHistory, setChatHistory] = useState([]);
  const [selectedChatIndex, setSelectedChatIndex] = useState(-1);
  const [generating, setGenerating] = useState(false);

  // Result pagination
  const [resultPage, setResultPage] = useState(1);
  const [resultLimit, setResultLimit] = useState(10);

  // Clipboard state
  const [copiedIndex, setCopiedIndex] = useState(null);

  // Quick prompt suggestions
  const suggestions = {
    mySql: [
      "Show all columns from the largest table",
      "List the top 5 records filtered by status active",
      "Count total rows in each table"
    ],
    postgres: [
      "Get counts of rows grouped by created date",
      "List all records with matching references",
      "Find recent entries in the database"
    ],
    mongoDb: [
      "Find all documents in the primary collection",
      "Count documents where category equals electronic",
      "Aggregate and sum total amount by user"
    ]
  };

  // Restore connection from localStorage if present
  useEffect(() => {
    const savedThread = localStorage.getItem("querygenius_thread_id");
    const savedDbType = localStorage.getItem("querygenius_db_type");
    const savedDbName = localStorage.getItem("querygenius_db_name");
    
    if (savedThread && savedDbType) {
      setThreadId(savedThread);
      setDbType(savedDbType);
      setDatabase(savedDbName || "");
      setIsConnected(true);
      fetchSchema(savedThread, savedDbType);
    }
  }, []);

  const fetchSchema = async (activeThreadId, activeDbType) => {
    setLoadingSchema(true);
    try {
      const response = await fetch(`/api/user/schema/${activeDbType}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: activeThreadId })
      });
      const data = await response.json();
      if (response.ok && data.schema) {
        setSchema(data.schema);
        // Expand first table by default
        if (data.schema.length > 0) {
          setExpandedTables({ [data.schema[0].table]: true });
        }
      } else {
        console.error("Failed to load schema:", data.message);
      }
    } catch (err) {
      console.error("Error fetching schema:", err);
    } finally {
      setLoadingSchema(false);
    }
  };

  const handleConnect = async (e) => {
    e.preventDefault();
    setConnecting(true);
    setConnectError("");

    try {
      const response = await fetch(`/api/user/connectDb/${dbType}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dbType, connectionString })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || data.issue?.message || "Failed to connect to database");
      }

      const activeThreadId = data.threadId;
      setThreadId(activeThreadId);
      setIsConnected(true);

      const dbName = getDbNameFromUri(connectionString);
      setDatabase(dbName);
      
      // Persist connection
      localStorage.setItem("querygenius_thread_id", activeThreadId);
      localStorage.setItem("querygenius_db_type", dbType);
      localStorage.setItem("querygenius_db_name", dbName);

      // Load Tables + Columns info
      fetchSchema(activeThreadId, dbType);
    } catch (err) {
      setConnectError(err.message);
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = () => {
    setIsConnected(false);
    setThreadId("");
    setSchema([]);
    setChatHistory([]);
    setSelectedChatIndex(-1);
    setConnectionString("");
    setDatabase("");
    
    localStorage.removeItem("querygenius_thread_id");
    localStorage.removeItem("querygenius_db_type");
    localStorage.removeItem("querygenius_db_name");
  };

  const handleAskAI = async (e, textQuestion = "") => {
    if (e) e.preventDefault();
    const activeQuestion = textQuestion || question;
    if (!activeQuestion.trim()) return;

    setGenerating(true);
    setQuestion("");

    // Add query to local history immediately as loading
    const tempIndex = chatHistory.length;
    const newChatEntry = {
      question: activeQuestion,
      query: "",
      explanation: "",
      warnings: [],
      results: [],
      loading: true
    };
    setChatHistory(prev => [...prev, newChatEntry]);
    setSelectedChatIndex(tempIndex);

    try {
      const response = await fetch(`/api/user/ask-ai/${dbType}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId,
          question: activeQuestion
        })
      });

      const data = await response.json();
      
      setChatHistory(prev => {
        const updated = [...prev];
        updated[tempIndex] = {
          question: activeQuestion,
          query: data.query || "",
          explanation: data.explanation || (response.ok ? "Query completed." : "Failed to generate query."),
          warnings: data.warnings || [],
          results: data.results || [],
          preview: data.preview || null,
          loading: false
        };
        return updated;
      });
      setResultPage(1); // Reset pagination for new results
    } catch (err) {
      setChatHistory(prev => {
        const updated = [...prev];
        updated[tempIndex] = {
          question: activeQuestion,
          query: "",
          explanation: "Server communication failed.",
          warnings: [err.message || "Unknown communication error"],
          results: [],
          preview: null,
          loading: false
        };
        return updated;
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleCopyToClipboard = (text, index) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const toggleTableExpand = (tableName) => {
    setExpandedTables(prev => ({
      ...prev,
      [tableName]: !prev[tableName]
    }));
  };

  // Get active chat details
  const activeChat = selectedChatIndex >= 0 ? chatHistory[selectedChatIndex] : null;

  // Pagination helper
  const paginatedResults = activeChat && activeChat.results 
    ? activeChat.results.slice((resultPage - 1) * resultLimit, resultPage * resultLimit)
    : [];

  const totalPages = activeChat && activeChat.results
    ? Math.ceil(activeChat.results.length / resultLimit)
    : 0;

  const exportToCSV = () => {
    if (!activeChat) return;

    let headers = [];
    let rows = [];

    if (activeChat.preview) {
      headers = activeChat.preview.columns || [];
      rows = activeChat.preview.rows || [];
    } else if (activeChat.results && activeChat.results.length > 0) {
      headers = Object.keys(activeChat.results[0]);
      rows = activeChat.results.map(row => headers.map(header => row[header]));
    } else {
      return;
    }

    const csvContent = [
      headers.join(","),
      ...rows.map(row => 
        row.map(cell => {
          let cellStr = cell === null ? "" : String(cell);
          cellStr = cellStr.replace(/"/g, '""');
          return `"${cellStr}"`;
        }).join(",")
      )
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${activeChat.preview ? "query_preview" : "query_results"}_${selectedChatIndex + 1}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#0b0f19] text-[#f1f5f9]">
      {/* HEADER */}
      <header className="flex items-center justify-between px-6 py-4 bg-[#0f172a] border-b border-white/5 shadow-lg">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-violet-600 flex items-center justify-center shadow-md shadow-indigo-500/20">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-white via-slate-200 to-indigo-400 bg-clip-text text-transparent">
              QueryGenius <span className="text-indigo-400 font-medium">AI</span>
            </h1>
            <p className="text-[10px] text-slate-400 font-mono tracking-wider">DATABASE COPILOT SYSTEM</p>
          </div>
        </div>

        {isConnected && (
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2 bg-[#1e293b]/70 border border-white/5 rounded-full px-4 py-1.5 text-xs text-slate-300">
              <span className={`w-2.5 h-2.5 rounded-full ${
                dbType === "mySql" ? "bg-cyan-500" : dbType === "postgres" ? "bg-indigo-500" : "bg-emerald-500"
              }`} />
              <span className="font-semibold uppercase font-mono">{dbType}</span>
              {database && (
                <>
                  <span className="text-slate-500">|</span>
                  <span className="text-slate-400 font-mono">{database}</span>
                </>
              )}
            </div>
            <button
              onClick={handleDisconnect}
              className="px-4 py-1.5 text-xs font-semibold text-rose-400 hover:text-white bg-rose-500/10 hover:bg-rose-600 border border-rose-500/30 hover:border-rose-600 rounded-lg transition-all cursor-pointer"
            >
              Disconnect
            </button>
          </div>
        )}
      </header>

      {/* BODY CONTENT */}
      <main className="flex-1 flex overflow-hidden">
        {!isConnected ? (
          /* CONNECTION MODAL / SCREEN */
          <div className="flex-1 flex items-center justify-center p-6 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#1e1b4b]/20 via-[#0b0f19] to-[#0b0f19]">
            <div className="w-full max-w-xl bg-[#0f172a]/80 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl p-8 transition-all hover:border-white/15">
              <h2 className="text-2xl font-extrabold text-white text-center mb-2">Connect Your Database</h2>
              <p className="text-sm text-slate-400 text-center mb-8">
                Establish a read-only database connection. QueryGenius AI will parse the structure to build context.
              </p>

              {/* DB TYPE SELECTOR */}
              <div className="grid grid-cols-3 gap-4 mb-6">
                {[
                  { id: "mySql", label: "MySQL", color: "border-cyan-500/50 hover:bg-cyan-500/5 text-cyan-400" },
                  { id: "postgres", label: "PostgreSQL", color: "border-indigo-500/50 hover:bg-indigo-500/5 text-indigo-400" },
                  { id: "mongoDb", label: "MongoDB", color: "border-emerald-500/50 hover:bg-emerald-500/5 text-emerald-400" }
                ].map(db => (
                  <button
                    key={db.id}
                    type="button"
                    onClick={() => {
                      setDbType(db.id);
                      setConnectError("");
                    }}
                    className={`flex flex-col items-center justify-center py-4 border rounded-xl transition-all cursor-pointer ${
                      dbType === db.id
                        ? `${db.id === "mySql" ? "bg-cyan-500/10 border-cyan-500 ring-2 ring-cyan-500/20" : db.id === "postgres" ? "bg-indigo-500/10 border-indigo-500 ring-2 ring-indigo-500/20" : "bg-emerald-500/10 border-emerald-500 ring-2 ring-emerald-500/20"}`
                        : "border-white/5 bg-[#182235]/40 hover:border-white/10"
                    }`}
                  >
                    <span className={`text-sm font-bold ${dbType === db.id ? "text-white" : "text-slate-400"}`}>
                      {db.label}
                    </span>
                  </button>
                ))}
              </div>

              {/* CONNECTION FORM */}
              <form onSubmit={handleConnect} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    CONNECTION STRING (URI)
                  </label>
                  <input
                    type="text"
                    required
                    placeholder={
                      dbType === "mySql"
                        ? "mysql://user:pass@host:3306/dbname"
                        : dbType === "postgres"
                        ? "postgresql://user:pass@host:5432/dbname"
                        : "mongodb+srv://user:pass@cluster.mongodb.net/dbname"
                    }
                    value={connectionString}
                    onChange={e => setConnectionString(e.target.value)}
                    className="w-full bg-[#070a13] border border-white/5 focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 rounded-lg px-4 py-2.5 text-sm outline-none transition-all font-mono"
                  />
                </div>

                {connectError && (
                  <div className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg p-3 leading-relaxed">
                    <span className="font-bold">Connection Failed: </span>
                    {connectError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={connecting}
                  className={`w-full py-3 rounded-lg text-sm font-bold text-white transition-all shadow-lg hover:shadow-indigo-500/10 cursor-pointer ${
                    dbType === "mySql"
                      ? "bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700"
                      : dbType === "postgres"
                      ? "bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700"
                      : "bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700"
                  }`}
                >
                  {connecting ? (
                    <div className="flex items-center justify-center space-x-2">
                      <span className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                      <span>Authenticating Connection...</span>
                    </div>
                  ) : (
                    "Establish Connection"
                  )}
                </button>
              </form>
            </div>
          </div>
        ) : (
          /* MAIN 3-PANEL INTERFACE */
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden bg-[#070a13]/40">
            
            {/* LEFT PANEL: Database Explorer */}
            <section className="w-full md:w-64 bg-[#0a0d1a] border-r border-white/5 flex flex-col h-1/3 md:h-auto overflow-hidden">
              <div className="p-4 border-b border-white/5 flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Schema Explorer</span>
                <button
                  onClick={() => fetchSchema(threadId, dbType)}
                  disabled={loadingSchema}
                  className="p-1 hover:bg-white/5 rounded text-slate-400 hover:text-white transition-all"
                  title="Reload Schema"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 ${loadingSchema ? "animate-spin text-indigo-400" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 7.89H17.64" />
                  </svg>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-3 space-y-1">
                {loadingSchema ? (
                  <div className="py-8 text-center text-xs text-slate-500">
                    <span className="inline-block w-4 h-4 border-2 border-slate-700 border-t-indigo-400 rounded-full animate-spin mb-2" />
                    <p>Scanning tables...</p>
                  </div>
                ) : schema.length === 0 ? (
                  <p className="text-xs text-slate-500 py-4 text-center">No tables or collections found.</p>
                ) : (
                  schema.map(tableObj => {
                    const isExpanded = expandedTables[tableObj.table];
                    return (
                      <div key={tableObj.table} className="border border-white/0 hover:border-white/5 rounded-lg overflow-hidden transition-all bg-[#0f1424]/30">
                        {/* Table Header */}
                        <button
                          onClick={() => toggleTableExpand(tableObj.table)}
                          className="w-full flex items-center justify-between px-3 py-2 text-left text-xs font-semibold text-slate-300 hover:text-white hover:bg-white/5 transition-all cursor-pointer"
                        >
                          <div className="flex items-center space-x-2 truncate">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-slate-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                            <span className="truncate">{tableObj.table}</span>
                          </div>
                          <svg xmlns="http://www.w3.org/2000/svg" className={`h-3 w-3 text-slate-500 transition-transform ${isExpanded ? "transform rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </button>

                        {/* Column List */}
                        {isExpanded && (
                          <div className="pl-6 pr-3 pb-2 pt-0.5 space-y-1 bg-[#0b0f19]/40 border-l border-white/5">
                            {tableObj.columns.map(col => (
                              <div key={col} className="flex items-center space-x-2 text-[11px] text-slate-400 font-mono py-0.5 truncate">
                                <span className="text-slate-600 font-semibold">•</span>
                                <span className="truncate">{col}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </section>

            {/* CENTER PANEL: Conversational Interface */}
            <section className="flex-1 flex flex-col border-r border-white/5 overflow-hidden h-1/2 md:h-auto">
              {/* Chat Log */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {chatHistory.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center p-6 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-4">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-indigo-400 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                      </svg>
                    </div>
                    <h3 className="text-lg font-bold text-white mb-1">AI SQL Copilot Active</h3>
                    <p className="text-xs text-slate-400 max-w-sm mb-6 leading-relaxed">
                      Ask your database any question in natural English. The AI will translate it and retrieve the data.
                    </p>

                    {/* SUGGESTION BUBBLES */}
                    <div className="w-full max-w-md space-y-2">
                      <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 block mb-2">Try asking:</span>
                      {suggestions[dbType]?.map((sug, i) => (
                        <button
                          key={i}
                          onClick={() => handleAskAI(null, sug)}
                          className="w-full text-left p-3 text-xs bg-[#111726] hover:bg-[#1a233b] border border-white/5 hover:border-white/10 rounded-xl transition-all cursor-pointer text-slate-300 hover:text-white"
                        >
                          {sug}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  chatHistory.map((chat, idx) => (
                    <div key={idx} className="space-y-2">
                      {/* User Bubble */}
                      <div className="flex justify-end">
                        <div className="bg-indigo-600/90 text-white rounded-2xl rounded-tr-none px-4 py-2 text-xs max-w-lg shadow-md leading-relaxed">
                          {chat.question}
                        </div>
                      </div>

                      {/* Loading or AI response trigger bubble */}
                      <div className="flex justify-start">
                        <button
                          onClick={() => setSelectedChatIndex(idx)}
                          className={`flex items-start space-x-2 text-left p-3 rounded-2xl rounded-tl-none text-xs max-w-lg transition-all cursor-pointer ${
                            selectedChatIndex === idx 
                              ? "bg-[#1d273d] border border-indigo-500/30 text-white shadow-lg" 
                              : "bg-[#111726] border border-white/5 text-slate-300 hover:bg-[#1a233b]"
                          }`}
                        >
                          <div className={`w-5 h-5 rounded-lg flex items-center justify-center flex-shrink-0 text-[10px] font-bold ${
                            selectedChatIndex === idx ? "bg-indigo-500 text-white" : "bg-slate-700 text-slate-300"
                          }`}>
                            AI
                          </div>
                          <div className="flex-1 min-w-0">
                            {chat.loading ? (
                              <div className="flex items-center space-x-2">
                                <span className="w-3 h-3 border border-indigo-400 border-t-transparent rounded-full animate-spin" />
                                <span className="text-slate-400 font-mono text-[11px]">Generating SQL & scanning schema...</span>
                              </div>
                            ) : (
                              <div>
                                <span className="font-mono text-[11px] block text-indigo-400 font-bold truncate mb-1">
                                  {chat.query ? chat.query.substring(0, 50) + (chat.query.length > 50 ? "..." : "") : "Query empty"}
                                </span>
                                <span className="text-slate-400 text-[11px] block truncate">
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
              <form onSubmit={handleAskAI} className="p-4 border-t border-white/5 bg-[#0a0d1a]">
                <div className="relative">
                  <input
                    type="text"
                    disabled={generating}
                    placeholder="Enter natural language query (e.g. 'Show orders total over 100 dollars')"
                    value={question}
                    onChange={e => setQuestion(e.target.value)}
                    className="w-full bg-[#070a13] border border-white/5 focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 rounded-xl pl-4 pr-12 py-3 text-xs outline-none transition-all"
                  />
                  <button
                    type="submit"
                    disabled={generating || !question.trim()}
                    className="absolute right-2 top-2 p-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 rounded-lg text-white transition-all cursor-pointer"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  </button>
                </div>
              </form>
            </section>

            {/* RIGHT PANEL: AI Generated Code & Explanation */}
            <section className="w-full md:w-80 bg-[#0a0d1a] border-l border-white/5 p-4 flex flex-col overflow-y-auto h-1/2 md:h-auto">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-4">AI Output Inspector</span>

              {!activeChat ? (
                <div className="flex-1 flex items-center justify-center text-center text-slate-500 text-xs py-12">
                  Select a query response from the chat to inspect.
                </div>
              ) : activeChat.loading ? (
                <div className="flex-1 flex flex-col items-center justify-center py-12 text-center text-xs text-slate-500">
                  <span className="inline-block w-6 h-6 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin mb-2" />
                  <p>Processing prompt through safety filters and model...</p>
                </div>
              ) : (
                <div className="space-y-4 flex-1 flex flex-col">
                  {/* WARNING PANEL (IF ANY) */}
                  {activeChat.warnings && activeChat.warnings.length > 0 && (
                    <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-xs text-amber-400 space-y-1">
                      <div className="flex items-center space-x-1.5 font-bold mb-1">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <span>Query Notice</span>
                      </div>
                      <ul className="list-disc pl-4 space-y-1 leading-relaxed">
                        {activeChat.warnings.map((warn, i) => (
                          <li key={i}>{warn}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* SQL GENERATION VIEW */}
                  {activeChat.query && (() => {
                    const cleanSQL = activeChat.query
                      .replace(/<[^>]*>/g, "")
                      .replace(/\b\d{3}\s+\w+-\w+\b/g, "");

                    return (
                      <div className="bg-[#070a13] border border-white/5 rounded-xl overflow-hidden shadow-inner">
                        <div className="bg-[#121929] px-3 py-2 flex items-center justify-between border-b border-white/5">
                          <span className="text-[10px] font-mono text-slate-400 uppercase font-semibold">
                            {dbType === "mongoDb" ? "MongoDB MQL" : "SQL Query"}
                          </span>
                          <button
                            onClick={() => handleCopyToClipboard(cleanSQL, selectedChatIndex)}
                            className="flex items-center space-x-1 px-2 py-1 text-[10px] font-semibold bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white rounded transition-all cursor-pointer"
                          >
                            {copiedIndex === selectedChatIndex ? (
                              <>
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                </svg>
                                <span className="text-emerald-400">Copied!</span>
                              </>
                            ) : (
                              <>
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                </svg>
                                <span>Copy</span>
                              </>
                            )}
                          </button>
                        </div>
                        <pre className="p-3 text-[11px] font-mono leading-relaxed overflow-x-auto whitespace-pre-wrap select-all max-h-48">
                          <code>{cleanSQL}</code>
                        </pre>
                      </div>
                    );
                  })()}

                  {/* EXPLANATION */}
                  <div className="space-y-1 flex-1">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">AI Explanation</span>
                    <p className="text-xs text-slate-300 leading-relaxed bg-[#111726]/40 border border-white/5 rounded-xl p-3">
                      {activeChat.explanation}
                    </p>
                  </div>
                </div>
              )}
            </section>
          </div>
        )}
      </main>

      {/* BOTTOM PANEL: Results Grid (Full Width) */}
      {isConnected && activeChat && !activeChat.loading && (
        <section className="bg-[#0b0f19] border-t border-white/5 p-4 max-h-80 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                {activeChat.preview ? "Expected State Preview" : "Query Results"}
              </span>
              {activeChat.preview ? (
                <span className="text-[10px] bg-violet-500/10 border border-violet-500/20 text-violet-400 rounded-full px-2 py-0.5 font-mono">
                  Simulated state
                </span>
              ) : activeChat.results && (
                <span className="text-[10px] bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-full px-2 py-0.5 font-mono">
                  {activeChat.results.length} rows returned
                </span>
              )}
            </div>

            {((activeChat.preview && activeChat.preview.columns && activeChat.preview.columns.length > 0) || 
              (activeChat.results && activeChat.results.length > 0)) && (
              <div className="flex items-center space-x-3">
                <button
                  onClick={exportToCSV}
                  className="flex items-center space-x-1.5 px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white rounded-lg transition-all cursor-pointer shadow-md shadow-emerald-500/10"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  <span>Export CSV</span>
                </button>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-auto border border-white/5 rounded-xl bg-[#0a0d1a]/50 shadow-inner">
            {activeChat.preview ? (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#121929] border-b border-white/5">
                    {activeChat.preview.columns.map(header => (
                      <th key={header} className="p-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider border-r border-white/5">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activeChat.preview.rows.map((row, rowIdx) => (
                    <tr key={rowIdx} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                      {row.map((cell, cellIdx) => (
                        <td key={cellIdx} className="p-3 text-xs font-mono text-slate-300 border-r border-white/5 max-w-[200px] truncate" title={String(cell)}>
                          {cell === null ? <span className="text-slate-600 italic">null</span> : String(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : !activeChat.results || activeChat.results.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">
                No rows returned.
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#121929] border-b border-white/5">
                    {Object.keys(activeChat.results[0]).map(header => (
                      <th key={header} className="p-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider border-r border-white/5">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginatedResults.map((row, rowIdx) => (
                    <tr key={rowIdx} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                      {Object.keys(row).map(header => (
                        <td key={header} className="p-3 text-xs font-mono text-slate-300 border-r border-white/5 max-w-[200px] truncate" title={String(row[header])}>
                          {row[header] === null ? <span className="text-slate-600 italic">null</span> : String(row[header])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* PAGINATION CONTROLS */}
          {activeChat.results && activeChat.results.length > resultLimit && (
            <div className="flex items-center justify-between mt-3 text-xs text-slate-400">
              <div className="flex items-center space-x-2">
                <span>Show</span>
                <select
                  value={resultLimit}
                  onChange={e => {
                    setResultLimit(Number(e.target.value));
                    setResultPage(1);
                  }}
                  className="bg-[#070a13] border border-white/5 rounded px-2 py-0.5 text-xs outline-none"
                >
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </select>
                <span>entries</span>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  disabled={resultPage === 1}
                  onClick={() => setResultPage(prev => Math.max(prev - 1, 1))}
                  className="px-2 py-1 bg-white/5 hover:bg-white/10 disabled:opacity-30 rounded transition-all cursor-pointer"
                >
                  Previous
                </button>
                <span>
                  Page <strong className="text-slate-200">{resultPage}</strong> of <strong className="text-slate-200">{totalPages}</strong>
                </span>
                <button
                  disabled={resultPage === totalPages}
                  onClick={() => setResultPage(prev => Math.min(prev + 1, totalPages))}
                  className="px-2 py-1 bg-white/5 hover:bg-white/10 disabled:opacity-30 rounded transition-all cursor-pointer"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

export default App;
