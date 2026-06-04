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

// Helper to safely extract column names from diverse formats (MySQL DESC object list vs Postgres/Mongo string array)
const getColumnNames = (columns) => {
  if (!columns || !Array.isArray(columns)) return [];
  return columns.map(col => {
    if (typeof col === "string") return col;
    if (col && typeof col === "object") {
      return col.Field || col.field || col.Column || col.column || "";
    }
    return String(col);
  }).filter(name => name !== "");
};

// Helper to determine risk level of a query (matches backend risk labels logic)
const getQueryRiskLabel = (query, dbType) => {
  if (!query || typeof query !== "string") return "SAFE";

  // Strip comments and string literals
  let cleanQuery = query;
  cleanQuery = cleanQuery.replace(/--.*$/gm, "");
  cleanQuery = cleanQuery.replace(/\/\*[\s\S]*?\*\//g, "");
  cleanQuery = cleanQuery.replace(/\/\/.*$/gm, "");
  cleanQuery = cleanQuery.replace(/'[^']*'/g, "''");
  cleanQuery = cleanQuery.replace(/"[^"]*"/g, '""');

  const cleanTrimmed = cleanQuery.trim();
  const cleanUpper = cleanTrimmed.toUpperCase();

  if (dbType === "mongoDb") {
    if (/\b(drop|dropDatabase)\b/i.test(cleanQuery)) {
      return "HIGH_RISK";
    }
    if (/\b(createCollection|createIndex)\b/i.test(cleanQuery)) {
      return "MODIFIES_SCHEMA";
    }
    if (/\b(insert|update|delete|remove|save|replaceOne|updateOne|updateMany|insertOne|insertMany|deleteOne|deleteMany)\b/i.test(cleanQuery)) {
      return "MODIFIES_DATA";
    }
    
    if (/\b(aggregate|lookup|group|bucket|facet)\b/i.test(cleanQuery) || !/\b(limit)\b/i.test(cleanQuery)) {
      return "READ_ONLY";
    }
    return "SAFE";
  } else {
    // SQL Risk Check
    if (/\b(DROP|TRUNCATE)\b/i.test(cleanUpper)) {
      return "HIGH_RISK";
    }
    if (/\b(CREATE|ALTER)\b/i.test(cleanUpper)) {
      return "MODIFIES_SCHEMA";
    }
    if (/\b(INSERT|UPDATE|DELETE)\b/i.test(cleanUpper)) {
      return "MODIFIES_DATA";
    }
    
    const hasJoin = /\bJOIN\b/i.test(cleanUpper);
    const hasGroupBy = /\bGROUP\s+BY\b/i.test(cleanUpper);
    const hasAggregates = /\b(COUNT|SUM|AVG|MIN|MAX)\b/i.test(cleanUpper);
    const hasLimit = /\bLIMIT\b/i.test(cleanUpper);

    if (hasJoin || hasGroupBy || hasAggregates || !hasLimit) {
      return "READ_ONLY";
    }
    return "SAFE";
  }
};

function App() {
  // Connection State
  const [isConnected, setIsConnected] = useState(false);
  const [dbType, setDbType] = useState("mySql"); // 'mySql', 'postgres', 'mongoDb'
  const [threadId, setThreadId] = useState("");
  
  // Connection Inputs
  const [connectionString, setConnectionString] = useState("");
  const [database, setDatabase] = useState("");

  // Table Data Explorer State
  const [selectedExplorerTable, setSelectedExplorerTable] = useState("");
  const [explorerTableData, setExplorerTableData] = useState({}); // cached data: { [tableName]: { rowData, columnData } }
  const [loadingExplorerData, setLoadingExplorerData] = useState(false);
  const [explorerError, setExplorerError] = useState("");
  const [bottomTab, setBottomTab] = useState("explorer"); // 'results' | 'explorer'

  // Query Execution State
  const [executing, setExecuting] = useState(false);
  const [executionError, setExecutionError] = useState("");

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

  const fetchTableExplorerData = async (tableName, activeThreadId = threadId, activeDbType = dbType, forceRefresh = false) => {
    if (!tableName) return;
    setExplorerError("");

    // If it's already cached and not a forced refresh, just select it and switch tab
    if (explorerTableData[tableName] && !forceRefresh) {
      setSelectedExplorerTable(tableName);
      setBottomTab("explorer");
      return;
    }

    setLoadingExplorerData(true);
    try {
      const response = await fetch(`/api/user/tableInfo/${activeDbType}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: activeThreadId, tableName })
      });
      const data = await response.json();
      if (response.ok) {
        setExplorerTableData(prev => ({
          ...prev,
          [tableName]: {
            rowData: data.rowData || [],
            columnData: data.columnData || []
          }
        }));
        setSelectedExplorerTable(tableName);
        setBottomTab("explorer");
      } else {
        setExplorerError(data.message || "Failed to load table data.");
      }
    } catch (err) {
      setExplorerError(err.message || "Communication error loading table data.");
    } finally {
      setLoadingExplorerData(false);
    }
  };

  const fetchSchema = async (activeThreadId, activeDbType, autoLoadTable = "") => {
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
          const firstTable = data.schema[0].table;
          setExpandedTables(prev => ({
            ...prev,
            [firstTable]: true
          }));
          
          const tableToLoad = autoLoadTable || firstTable;
          // Trigger data loading for the selected explorer table
          fetchTableExplorerData(tableToLoad, activeThreadId, activeDbType, !!autoLoadTable);
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
      
      // Clear explorer states
      setSelectedExplorerTable("");
      setExplorerTableData({});
      setExplorerError("");
      setBottomTab("explorer");
      
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
    
    // Clear explorer states
    setSelectedExplorerTable("");
    setExplorerTableData({});
    setExplorerError("");
    setBottomTab("explorer");
    
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
    setBottomTab("results");

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

  const handleRefresh = async () => {
    // Clear cached previews
    setExplorerTableData({});
    // Fetch schema and reload currently selected explorer table (or first table if none selected)
    await fetchSchema(threadId, dbType, selectedExplorerTable);
  };

  const handleExecuteQuery = async (queryToExecute) => {
    if (!queryToExecute) return;
    
    const label = getQueryRiskLabel(queryToExecute, dbType);
    if (label === "HIGH_RISK") {
      alert("High risk queries cannot be executed.");
      return;
    }
    
    if (label === "MODIFIES_DATA" || label === "MODIFIES_SCHEMA") {
      const confirmed = window.confirm(`Warning: This query modifies database ${label === "MODIFIES_DATA" ? "data" : "schema"}. Are you sure you want to execute it?`);
      if (!confirmed) return;
    }

    setExecuting(true);
    setExecutionError("");

    try {
      const response = await fetch(`/api/user/execute-query/${dbType}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId,
          query: queryToExecute
        })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Failed to execute query.");
      }
      setChatHistory(prev => {
        const updated = [...prev];
        if (selectedChatIndex >= 0) {
          updated[selectedChatIndex] = {
            ...updated[selectedChatIndex],
            results: data.type === "SELECT" ? (data.results || []) : [],
            affectedRows: data.affectedRows || 0,
            executionMessage: data.message || "",
            executionType: data.type,
            executed: true,
            preview: data.type === "SELECT" ? updated[selectedChatIndex].preview : null
          };
        }
        return updated;
      });
      setBottomTab("results");
      setResultPage(1);

      // Refresh schema & Data Explorer so the user immediately sees changes
      handleRefresh();

    } catch (err) {
      setExecutionError(err.message);
      alert(`Execution Error: ${err.message}`);
    } finally {
      setExecuting(false);
    }
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
    let headers = [];
    let rows = [];
    let filename = "export";

    if (bottomTab === "explorer") {
      if (!selectedExplorerTable || !explorerTableData[selectedExplorerTable]) return;
      const data = explorerTableData[selectedExplorerTable];
      headers = getColumnNames(data.columnData);
      rows = data.rowData.map(row => headers.map(header => row[header]));
      filename = `table_${selectedExplorerTable}`;
    } else {
      if (!activeChat) return;
      if (activeChat.preview) {
        headers = activeChat.preview.columns || [];
        rows = activeChat.preview.rows || [];
      } else if (activeChat.results && activeChat.results.length > 0) {
        headers = Object.keys(activeChat.results[0]);
        rows = activeChat.results.map(row => headers.map(header => row[header]));
      } else {
        return;
      }
      filename = `${activeChat.preview ? "query_preview" : "query_results"}_${selectedChatIndex + 1}`;
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
    link.setAttribute("download", `${filename}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#F5F4F0] text-[#252420]">
      {/* HEADER */}
      <header className="flex items-center justify-between px-6 py-4 bg-white border-b border-[#DDD9D2]">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-[#4A7C59] flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold text-[#252420]">
              QueryGenius <span className="text-[#4A7C59] font-medium">AI</span>
            </h1>
            <p className="text-[10px] text-[#9B9589] font-mono tracking-wider">DATABASE COPILOT SYSTEM</p>
          </div>
        </div>

        {isConnected && (
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2 bg-[#F5F4F0] border border-[#DDD9D2] rounded-full px-4 py-1.5 text-xs text-[#252420]">
              <span className={`w-2.5 h-2.5 rounded-full ${
                dbType === "mySql" ? "bg-blue-500" : dbType === "postgres" ? "bg-indigo-500" : "bg-emerald-500"
              }`} />
              <span className="font-semibold uppercase font-mono">{dbType}</span>
              {database && (
                <>
                  <span className="text-[#9B9589]">|</span>
                  <span className="text-[#9B9589] font-mono">{database}</span>
                </>
              )}
            </div>
            <button
              onClick={handleDisconnect}
              className="px-4 py-1.5 text-xs font-semibold text-[#4A7C59] hover:bg-[#D4EFD9] bg-transparent border border-[#4A7C59] rounded-lg transition-all cursor-pointer"
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
          <div className="flex-1 flex items-center justify-center p-6 bg-[#F5F4F0]">
            <div className="w-full max-w-xl bg-white border border-[#DDD9D2] rounded-2xl p-8 transition-all">
              <h2 className="text-2xl font-extrabold text-[#252420] text-center mb-2">Connect Your Database</h2>
              <p className="text-sm text-[#9B9589] text-center mb-8">
                Establish a read-only database connection. QueryGenius AI will parse the structure to build context.
              </p>

              {/* DB TYPE SELECTOR */}
              <div className="grid grid-cols-3 gap-4 mb-6">
                {[
                  { id: "mySql", label: "MySQL", color: "border-blue-500 text-blue-500" },
                  { id: "postgres", label: "PostgreSQL", color: "border-indigo-500 text-indigo-500" },
                  { id: "mongoDb", label: "MongoDB", color: "border-emerald-500 text-emerald-500" }
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
                        ? `${db.id === "mySql" ? "bg-blue-50 border-blue-500" : db.id === "postgres" ? "bg-indigo-50 border-indigo-500" : "bg-emerald-50 border-emerald-500"}`
                        : "border-[#DDD9D2] bg-white hover:border-[#9B9589]"
                    }`}
                  >
                    <span className={`text-sm font-bold ${dbType === db.id ? "text-[#252420]" : "text-[#9B9589]"}`}>
                      {db.label}
                    </span>
                  </button>
                ))}
              </div>

              {/* CONNECTION FORM */}
              <form onSubmit={handleConnect} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-[#9B9589] mb-1">
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
                    className="w-full bg-[#F5F4F0] border border-[#DDD9D2] focus:border-[#4A7C59] focus:ring-1 focus:ring-[#4A7C59] rounded-lg px-4 py-2.5 text-sm outline-none transition-all font-mono text-[#252420]"
                  />
                </div>

                {connectError && (
                  <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-3 leading-relaxed">
                    <span className="font-bold">Connection Failed: </span>
                    {connectError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={connecting}
                  className="w-full py-3 rounded-lg text-sm font-bold text-white transition-all cursor-pointer bg-[#4A7C59] hover:bg-[#3d664a]"
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
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden bg-[#F5F4F0]">
            
            {/* LEFT PANEL: Database Explorer */}
            <section className="w-full md:w-1/4 bg-white border-r border-[#DDD9D2] flex flex-col h-1/3 md:h-auto overflow-hidden">
              <div className="p-4 border-b border-[#DDD9D2] flex items-center justify-between sticky top-0 bg-white z-10">
                <span className="text-xs font-bold uppercase tracking-wider text-[#9B9589]">Schema Explorer</span>
                <button
                  onClick={handleRefresh}
                  disabled={loadingSchema || loadingExplorerData}
                  className="p-1 hover:bg-[#F5F4F0] rounded text-[#9B9589] hover:text-[#252420] transition-all cursor-pointer"
                  title="Reload Schema and Table Data"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 ${loadingSchema || loadingExplorerData ? "animate-spin text-[#4A7C59]" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 7.89H17.64" />
                  </svg>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {loadingSchema ? (
                  <div className="py-8 text-center text-xs text-[#9B9589]">
                    <span className="inline-block w-4 h-4 border-2 border-[#DDD9D2] border-t-[#4A7C59] rounded-full animate-spin mb-2" />
                    <p>Scanning tables...</p>
                  </div>
                ) : schema.length === 0 ? (
                  <p className="text-xs text-[#9B9589] py-4 text-center">No tables or collections found.</p>
                ) : (
                  schema.map(tableObj => {
                    const isExpanded = expandedTables[tableObj.table];
                    return (
                      <div key={tableObj.table} className="border border-transparent hover:border-[#DDD9D2] rounded-lg overflow-hidden transition-all bg-white">
                        {/* Table Header */}
                        <button
                          onClick={() => {
                            toggleTableExpand(tableObj.table);
                            fetchTableExplorerData(tableObj.table);
                          }}
                          className={`w-full flex items-center justify-between px-3 py-2.5 text-left text-sm font-bold transition-all cursor-pointer rounded-lg ${
                            selectedExplorerTable === tableObj.table
                              ? "bg-[#D4EFD9] text-[#4A7C59]"
                              : "text-[#252420] hover:bg-[#F5F4F0]"
                          }`}
                        >
                          <div className="flex items-center space-x-2 truncate">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 flex-shrink-0 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                            <span className="truncate">{tableObj.table}</span>
                          </div>
                          <svg xmlns="http://www.w3.org/2000/svg" className={`h-3.5 w-3.5 transition-transform opacity-70 ${isExpanded ? "transform rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </button>

                        {/* Column List */}
                        {isExpanded && (
                          <div className="pl-8 pr-3 pb-3 pt-1 space-y-1.5 border-l border-transparent">
                            {tableObj.columns.map(col => (
                              <div key={col} className="flex items-center space-x-2 text-[11px] text-[#9B9589] font-mono truncate">
                                <span className="opacity-50">•</span>
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
            <section className="flex-1 flex flex-col border-r border-[#DDD9D2] overflow-hidden h-1/2 md:h-auto bg-[#F5F4F0]">
              {/* Chat Log */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {chatHistory.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center p-6 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-[#D4EFD9] flex items-center justify-center mb-4">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-[#4A7C59] animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                      </svg>
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
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  </button>
                </div>
              </form>
            </section>

            {/* RIGHT PANEL: AI Generated Code & Explanation */}
            {/* RIGHT PANEL: AI Generated Code & Explanation */}
            <section className="w-full md:w-[35%] bg-white border-l border-[#DDD9D2] p-5 flex flex-col overflow-y-auto h-1/2 md:h-auto">
              <span className="text-xs font-bold uppercase tracking-wider text-[#9B9589] block mb-5">AI Output Inspector</span>

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
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
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
                  {activeChat.query && (() => {
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
                              onClick={() => handleCopyToClipboard(cleanSQL, selectedChatIndex)}
                              className="flex items-center space-x-1 px-2.5 py-1 text-[11px] font-bold bg-white border border-[#DDD9D2] hover:bg-gray-50 text-[#252420] rounded transition-all cursor-pointer"
                            >
                              {copiedIndex === selectedChatIndex ? (
                                <>
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-[#4A7C59]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                  </svg>
                                  <span className="text-[#4A7C59]">Copied!</span>
                                </>
                              ) : (
                                <>
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                  </svg>
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
                          <span className="text-xs text-[#9B9589] font-bold uppercase tracking-wider">Risk Level:</span>
                          <span className={`text-[10px] font-bold px-2.5 py-1 rounded-md border ${
                            label === "SAFE"
                              ? "bg-green-100 text-green-800 border-green-200"
                              : label === "READ_ONLY"
                              ? "bg-gray-100 text-gray-800 border-gray-200"
                              : label === "MODIFIES_DATA"
                              ? "bg-amber-100 text-amber-800 border-amber-200"
                              : label === "MODIFIES_SCHEMA"
                              ? "bg-orange-100 text-orange-800 border-orange-200"
                              : "bg-red-100 text-red-800 border-red-200"
                          }`}>
                            {label}
                          </span>
                        </div>

                        {/* Execution Controls */}
                        <div className="pt-2">
                          {activeChat.executed ? (
                            <div className="flex items-center justify-center space-x-2 bg-green-50 border border-green-200 text-green-700 py-3 rounded-xl text-sm font-bold uppercase tracking-wider">
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
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
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                              </svg>
                              <span>Execution Blocked (High Risk)</span>
                            </button>
                          ) : (label === "MODIFIES_DATA" || label === "MODIFIES_SCHEMA") ? (
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
                    <span className="text-[11px] font-bold text-[#9B9589] uppercase tracking-wider block">AI Explanation</span>
                    <p className="text-sm text-[#252420] leading-relaxed">
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
      {isConnected && (
        <section className="bg-white border-t border-[#DDD9D2] p-5 max-h-80 overflow-hidden flex flex-col shadow-sm">
          {/* TAB HEADER */}
          <div className="flex items-center justify-between mb-4 border-b border-[#DDD9D2] pb-2">
            <div className="flex items-center space-x-6">
              <button
                type="button"
                onClick={() => setBottomTab("explorer")}
                className={`text-sm font-bold tracking-wider pb-2 transition-all cursor-pointer border-b-2 ${
                  bottomTab === "explorer"
                    ? "text-[#4A7C59] border-[#4A7C59]"
                    : "text-[#9B9589] hover:text-[#252420] border-transparent"
                }`}
              >
                Table Data Explorer
              </button>
              {activeChat && (
                <button
                  type="button"
                  onClick={() => setBottomTab("results")}
                  className={`text-sm font-bold tracking-wider pb-2 transition-all cursor-pointer border-b-2 ${
                    bottomTab === "results"
                      ? "text-[#4A7C59] border-[#4A7C59]"
                      : "text-[#9B9589] hover:text-[#252420] border-transparent"
                  }`}
                >
                  Query Results
                </button>
              )}
            </div>

            <div className="flex items-center space-x-4">
              {bottomTab === "explorer" && selectedExplorerTable && (
                <div className="flex items-center space-x-2 text-xs text-[#9B9589] mr-2">
                  <span className="font-semibold text-[#252420]">Table: {selectedExplorerTable}</span>
                  <span className="text-[#DDD9D2]">|</span>
                  <span className="font-mono bg-[#F5F4F0] border border-[#DDD9D2] text-[#252420] rounded-md px-2 py-0.5 text-[11px]">
                    {explorerTableData[selectedExplorerTable]?.rowData?.length || 0} rows loaded
                  </span>
                </div>
              )}
              {bottomTab === "results" && activeChat && (
                <div className="flex items-center space-x-2 text-xs text-[#9B9589] mr-2">
                  {activeChat.preview ? (
                    <span className="text-[11px] bg-purple-100 border border-purple-200 text-purple-800 rounded-md px-2 py-1 font-mono">
                      Simulated state
                    </span>
                  ) : activeChat.results && (
                    <span className="text-[11px] bg-[#D4EFD9] border border-[#4A7C59] text-[#4A7C59] rounded-md px-2 py-1 font-mono">
                      {activeChat.results.length} rows returned
                    </span>
                  )}
                </div>
              )}

              {/* Export CSV Button */}
              {((bottomTab === "explorer" && explorerTableData[selectedExplorerTable]?.rowData?.length > 0) ||
                (bottomTab === "results" && activeChat && (
                  (activeChat.preview && activeChat.preview.columns && activeChat.preview.columns.length > 0) ||
                  (activeChat.results && activeChat.results.length > 0)
                ))) && (
                <button
                  onClick={exportToCSV}
                  className="flex items-center space-x-1.5 px-3 py-1.5 bg-[#4A7C59] hover:bg-[#3d664a] text-xs font-bold text-white rounded-lg transition-all cursor-pointer shadow-sm"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  <span>Export CSV</span>
                </button>
              )}
            </div>
          </div>

          {/* TAB CONTENT */}
          {bottomTab === "explorer" ? (
            <div className="flex-1 overflow-auto border border-[#DDD9D2] rounded-xl bg-white shadow-sm">
              {loadingExplorerData ? (
                <div className="py-8 text-center text-sm text-[#9B9589] flex flex-col items-center justify-center h-full">
                  <span className="inline-block w-6 h-6 border-2 border-[#DDD9D2] border-t-[#4A7C59] rounded-full animate-spin mb-3" />
                  <p>Loading table data from database...</p>
                </div>
              ) : explorerError ? (
                <div className="py-8 text-center text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl p-4 m-4">
                  <p className="font-bold mb-1">Error loading table data:</p>
                  <p>{explorerError}</p>
                </div>
              ) : !selectedExplorerTable ? (
                <div className="py-8 text-center text-sm text-[#9B9589] flex items-center justify-center h-full">
                  Select a table from the schema explorer to view its contents.
                </div>
              ) : !explorerTableData[selectedExplorerTable] || !explorerTableData[selectedExplorerTable].rowData || explorerTableData[selectedExplorerTable].rowData.length === 0 ? (
                <div className="py-8 text-center text-sm text-[#9B9589] flex items-center justify-center h-full">
                  No rows found in this table.
                </div>
              ) : (() => {
                const tableData = explorerTableData[selectedExplorerTable];
                const cols = getColumnNames(tableData.columnData);
                return (
                  <table className="w-full text-left border-collapse min-w-max">
                    <thead>
                      <tr className="bg-[#F5F4F0] border-b border-[#DDD9D2] sticky top-0 z-10">
                        {cols.map(header => (
                          <th key={header} className="p-3 text-[11px] font-bold text-[#9B9589] uppercase tracking-wider border-r border-[#DDD9D2] whitespace-nowrap">
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {tableData.rowData.map((row, rowIdx) => (
                        <tr key={rowIdx} className="border-b border-[#DDD9D2] hover:bg-gray-50 even:bg-[#FAFAFA] transition-colors">
                          {cols.map(header => {
                            const val = row[header];
                            return (
                              <td key={header} className="p-3 text-sm font-mono text-[#252420] border-r border-[#DDD9D2] max-w-[300px] truncate" title={val !== null ? String(val) : ""}>
                                {val === null ? <span className="text-[#9B9589] italic">null</span> : String(val)}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                );
              })()}
            </div>
          ) : (
            /* QUERY RESULTS TAB */
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex-1 overflow-auto border border-[#DDD9D2] rounded-xl bg-white shadow-sm">
                {!activeChat ? (
                  <div className="py-8 text-center text-sm text-[#9B9589] flex items-center justify-center h-full">
                    No active query results. Select a chat query response to view results.
                  </div>
                ) : activeChat.loading ? (
                  <div className="py-8 text-center text-sm text-[#9B9589] flex flex-col items-center justify-center h-full">
                    <span className="inline-block w-5 h-5 border-2 border-[#DDD9D2] border-t-[#4A7C59] rounded-full animate-spin mb-3" />
                    <p>Generating query results...</p>
                  </div>
                ) : activeChat.preview ? (
                  <table className="w-full text-left border-collapse min-w-max">
                    <thead>
                      <tr className="bg-[#F5F4F0] border-b border-[#DDD9D2] sticky top-0 z-10">
                        {activeChat.preview.columns.map(header => (
                          <th key={header} className="p-3 text-[11px] font-bold text-[#9B9589] uppercase tracking-wider border-r border-[#DDD9D2] whitespace-nowrap">
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {activeChat.preview.rows.map((row, rowIdx) => (
                        <tr key={rowIdx} className="border-b border-[#DDD9D2] hover:bg-gray-50 even:bg-[#FAFAFA] transition-colors">
                          {row.map((cell, cellIdx) => (
                            <td key={cellIdx} className="p-3 text-sm font-mono text-[#252420] border-r border-[#DDD9D2] max-w-[200px] truncate" title={String(cell)}>
                              {cell === null ? <span className="text-[#9B9589] italic">null</span> : String(cell)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : activeChat.executionMessage ? (
                  <div className="py-8 text-center text-sm text-[#252420] font-mono flex flex-col items-center justify-center h-full bg-green-50/50">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-[#4A7C59] mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-[#252420] font-bold mb-1 text-base">Execution Successful</p>
                    <p className="text-[#9B9589]">{activeChat.executionMessage}</p>
                  </div>
                ) : !activeChat.results || activeChat.results.length === 0 ? (
                  <div className="py-8 text-center text-sm text-[#9B9589] flex items-center justify-center h-full">
                    No rows returned.
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse min-w-max">
                    <thead>
                      <tr className="bg-[#F5F4F0] border-b border-[#DDD9D2] sticky top-0 z-10">
                        {Object.keys(activeChat.results[0]).map(header => (
                          <th key={header} className="p-3 text-[11px] font-bold text-[#9B9589] uppercase tracking-wider border-r border-[#DDD9D2] whitespace-nowrap">
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedResults.map((row, rowIdx) => (
                        <tr key={rowIdx} className="border-b border-[#DDD9D2] hover:bg-gray-50 even:bg-[#FAFAFA] transition-colors">
                          {Object.keys(row).map(header => (
                            <td key={header} className="p-3 text-sm font-mono text-[#252420] border-r border-[#DDD9D2] max-w-[200px] truncate" title={String(row[header])}>
                              {row[header] === null ? <span className="text-[#9B9589] italic">null</span> : String(row[header])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* PAGINATION CONTROLS */}
              {activeChat && !activeChat.loading && activeChat.results && activeChat.results.length > resultLimit && (
                <div className="flex items-center justify-between mt-4 text-sm text-[#9B9589]">
                  <div className="flex items-center space-x-2">
                    <span>Show</span>
                    <select
                      value={resultLimit}
                      onChange={e => {
                        setResultLimit(Number(e.target.value));
                        setResultPage(1);
                      }}
                      className="bg-white border border-[#DDD9D2] text-[#252420] rounded px-2 py-1 text-sm outline-none"
                    >
                      <option value={5}>5</option>
                      <option value={10}>10</option>
                      <option value={20}>20</option>
                      <option value={50}>50</option>
                    </select>
                    <span>entries</span>
                  </div>

                  <div className="flex items-center space-x-3">
                    <button
                      disabled={resultPage === 1}
                      onClick={() => setResultPage(prev => Math.max(prev - 1, 1))}
                      className="px-3 py-1 bg-white hover:bg-[#F5F4F0] border border-[#DDD9D2] text-[#252420] disabled:opacity-50 rounded-md transition-all cursor-pointer"
                    >
                      Previous
                    </button>
                    <span>
                      Page <strong className="text-[#252420]">{resultPage}</strong> of <strong className="text-[#252420]">{totalPages}</strong>
                    </span>
                    <button
                      disabled={resultPage === totalPages}
                      onClick={() => setResultPage(prev => Math.min(prev + 1, totalPages))}
                      className="px-3 py-1 bg-white hover:bg-[#F5F4F0] border border-[#DDD9D2] text-[#252420] disabled:opacity-50 rounded-md transition-all cursor-pointer"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

export default App;
