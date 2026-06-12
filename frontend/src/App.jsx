import { useState, useEffect } from "react";
import "./App.css";

import Header from "./components/Header";
import ConnectionModal from "./components/ConnectionModal";
import DatabaseExplorer from "./components/DatabaseExplorer";
import ChatPanel from "./components/ChatPanel";
import AIOutputInspector from "./components/AIOutputInspector";
import ResultsPanel from "./components/ResultsPanel";

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
      <Header
        isConnected={isConnected}
        dbType={dbType}
        database={database}
        handleDisconnect={handleDisconnect}
      />

      {/* BODY CONTENT */}
      <main className="flex-1 flex overflow-hidden">
        {!isConnected ? (
          /* CONNECTION MODAL / SCREEN */
          <ConnectionModal
            dbType={dbType}
            setDbType={setDbType}
            connectionString={connectionString}
            setConnectionString={setConnectionString}
            handleConnect={handleConnect}
            connectError={connectError}
            setConnectError={setConnectError}
            connecting={connecting}
          />
        ) : (
          /* MAIN 3-PANEL INTERFACE */
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden bg-[#F5F4F0]">
            
            {/* LEFT PANEL: Database Explorer */}
            <DatabaseExplorer
              loadingSchema={loadingSchema}
              loadingExplorerData={loadingExplorerData}
              schema={schema}
              expandedTables={expandedTables}
              toggleTableExpand={toggleTableExpand}
              fetchTableExplorerData={fetchTableExplorerData}
              selectedExplorerTable={selectedExplorerTable}
              handleRefresh={handleRefresh}
            />

            {/* CENTER PANEL: Conversational Interface */}
            <ChatPanel
              chatHistory={chatHistory}
              dbType={dbType}
              suggestions={suggestions}
              handleAskAI={handleAskAI}
              setSelectedChatIndex={setSelectedChatIndex}
              selectedChatIndex={selectedChatIndex}
              question={question}
              setQuestion={setQuestion}
              generating={generating}
            />

            {/* RIGHT PANEL: AI Generated Code & Explanation */}
            <AIOutputInspector
              activeChat={activeChat}
              dbType={dbType}
              getQueryRiskLabel={getQueryRiskLabel}
              handleCopyToClipboard={handleCopyToClipboard}
              copiedIndex={copiedIndex}
              selectedChatIndex={selectedChatIndex}
              executing={executing}
              handleExecuteQuery={handleExecuteQuery}
            />
          </div>
        )}
      </main>
      {/* BOTTOM PANEL: Results Grid (Full Width) */}
      {isConnected && (
        <ResultsPanel
          bottomTab={bottomTab}
          setBottomTab={setBottomTab}
          selectedExplorerTable={selectedExplorerTable}
          explorerTableData={explorerTableData}
          activeChat={activeChat}
          exportToCSV={exportToCSV}
          loadingExplorerData={loadingExplorerData}
          explorerError={explorerError}
          getColumnNames={getColumnNames}
          paginatedResults={paginatedResults}
          resultPage={resultPage}
          resultLimit={resultLimit}
          setResultPage={setResultPage}
          setResultLimit={setResultLimit}
          totalPages={totalPages}
        />
      )}
    </div>
  );
}

export default App;
