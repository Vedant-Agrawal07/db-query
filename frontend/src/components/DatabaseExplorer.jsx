import React from "react";
import { RefreshCw, Table, ChevronRight } from "lucide-react";

function DatabaseExplorer({
  loadingSchema,
  loadingExplorerData,
  schema,
  expandedTables,
  toggleTableExpand,
  fetchTableExplorerData,
  selectedExplorerTable,
  handleRefresh
}) {
  return (
    <section className="w-full md:w-1/4 bg-white border-r border-[#DDD9D2] flex flex-col h-1/3 md:h-auto overflow-hidden">
      <div className="p-4 border-b border-[#DDD9D2] flex items-center justify-between sticky top-0 bg-white z-10">
        <span className="text-xs font-bold uppercase tracking-wider text-[#9B9589]">Schema Explorer</span>
        <button
          onClick={handleRefresh}
          disabled={loadingSchema || loadingExplorerData}
          className="p-1 hover:bg-[#F5F4F0] rounded text-[#9B9589] hover:text-[#252420] transition-all cursor-pointer"
          title="Reload Schema and Table Data"
        >
          <RefreshCw className={`h-4 w-4 ${loadingSchema || loadingExplorerData ? "animate-spin text-[#4A7C59]" : ""}`} />
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
                    <Table className="h-4 w-4 flex-shrink-0 opacity-70" />
                    <span className="truncate">{tableObj.table}</span>
                  </div>
                  <ChevronRight className={`h-3.5 w-3.5 transition-transform opacity-70 ${isExpanded ? "transform rotate-90" : ""}`} />
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
  );
}

export default DatabaseExplorer;
