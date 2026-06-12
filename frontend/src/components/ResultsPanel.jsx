import React from "react";
import { Download, CheckCircle } from "lucide-react";

function ResultsPanel({
  bottomTab,
  setBottomTab,
  selectedExplorerTable,
  explorerTableData,
  activeChat,
  exportToCSV,
  loadingExplorerData,
  explorerError,
  getColumnNames,
  paginatedResults,
  resultPage,
  resultLimit,
  setResultPage,
  setResultLimit,
  totalPages,
}) {
  return (
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
              <span className="font-semibold text-[#252420]">
                Table: {selectedExplorerTable}
              </span>
              <span className="text-[#DDD9D2]">|</span>
              <span className="font-mono bg-[#F5F4F0] border border-[#DDD9D2] text-[#252420] rounded-md px-2 py-0.5 text-[11px]">
                {explorerTableData[selectedExplorerTable]?.rowData?.length || 0}{" "}
                rows loaded
              </span>
            </div>
          )}
          {bottomTab === "results" && activeChat && (
            <div className="flex items-center space-x-2 text-xs text-[#9B9589] mr-2">
              {activeChat.preview ? (
                <span className="text-[11px] bg-purple-100 border border-purple-200 text-purple-800 rounded-md px-2 py-1 font-mono">
                  Simulated state
                </span>
              ) : (
                activeChat.results && (
                  <span className="text-[11px] bg-[#D4EFD9] border border-[#4A7C59] text-[#4A7C59] rounded-md px-2 py-1 font-mono">
                    {activeChat.results.length} rows returned
                  </span>
                )
              )}
            </div>
          )}

          {/* Export CSV Button */}
          {((bottomTab === "explorer" &&
            explorerTableData[selectedExplorerTable]?.rowData?.length > 0) ||
            (bottomTab === "results" &&
              activeChat &&
              ((activeChat.preview &&
                activeChat.preview.columns &&
                activeChat.preview.columns.length > 0) ||
                (activeChat.results && activeChat.results.length > 0)))) && (
            <button
              onClick={exportToCSV}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-[#4A7C59] hover:bg-[#3d664a] text-xs font-bold text-white rounded-lg transition-all cursor-pointer shadow-sm"
            >
              <Download className="h-4 w-4" />
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
          ) : !explorerTableData[selectedExplorerTable] ||
            !explorerTableData[selectedExplorerTable].rowData ||
            explorerTableData[selectedExplorerTable].rowData.length === 0 ? (
            <div className="py-8 text-center text-sm text-[#9B9589] flex items-center justify-center h-full">
              No rows found in this table.
            </div>
          ) : (
            (() => {
              const tableData = explorerTableData[selectedExplorerTable];
              const cols = getColumnNames(tableData.columnData);
              return (
                <table className="w-full text-left border-collapse min-w-max">
                  <thead>
                    <tr className="bg-[#F5F4F0] border-b border-[#DDD9D2] sticky top-0 z-10">
                      {cols.map((header) => (
                        <th
                          key={header}
                          className="p-3 text-[11px] font-bold text-[#9B9589] uppercase tracking-wider border-r border-[#DDD9D2] whitespace-nowrap"
                        >
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tableData.rowData.map((row, rowIdx) => (
                      <tr
                        key={rowIdx}
                        className="border-b border-[#DDD9D2] hover:bg-gray-50 even:bg-[#FAFAFA] transition-colors"
                      >
                        {cols.map((header) => {
                          const val = row[header];
                          return (
                            <td
                              key={header}
                              className="p-3 text-sm font-mono text-[#252420] border-r border-[#DDD9D2] max-w-[300px] truncate"
                              title={val !== null ? String(val) : ""}
                            >
                              {val === null ? (
                                <span className="text-[#9B9589] italic">
                                  null
                                </span>
                              ) : (
                                String(val)
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              );
            })()
          )}
        </div>
      ) : (
        /* QUERY RESULTS TAB */
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-auto border border-[#DDD9D2] rounded-xl bg-white shadow-sm">
            {!activeChat ? (
              <div className="py-8 text-center text-sm text-[#9B9589] flex items-center justify-center h-full">
                No active query results. Select a chat query response to view
                results.
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
                    {activeChat.preview.columns.map((header) => (
                      <th
                        key={header}
                        className="p-3 text-[11px] font-bold text-[#9B9589] uppercase tracking-wider border-r border-[#DDD9D2] whitespace-nowrap"
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activeChat.preview.rows.map((row, rowIdx) => (
                    <tr
                      key={rowIdx}
                      className="border-b border-[#DDD9D2] hover:bg-gray-50 even:bg-[#FAFAFA] transition-colors"
                    >
                      {row.map((cell, cellIdx) => (
                        <td
                          key={cellIdx}
                          className="p-3 text-sm font-mono text-[#252420] border-r border-[#DDD9D2] max-w-[200px] truncate"
                          title={String(cell)}
                        >
                          {cell === null ? (
                            <span className="text-[#9B9589] italic">null</span>
                          ) : (
                            String(cell)
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : activeChat.executionMessage ? (
              <div className="py-8 text-center text-sm text-[#252420] font-mono flex flex-col items-center justify-center h-full bg-green-50/50">
                <CheckCircle className="h-10 w-10 text-[#4A7C59] mb-3" />
                <p className="text-[#252420] font-bold mb-1 text-base">
                  Execution Successful
                </p>
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
                    {Object.keys(activeChat.results[0]).map((header) => (
                      <th
                        key={header}
                        className="p-3 text-[11px] font-bold text-[#9B9589] uppercase tracking-wider border-r border-[#DDD9D2] whitespace-nowrap"
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginatedResults.map((row, rowIdx) => (
                    <tr
                      key={rowIdx}
                      className="border-b border-[#DDD9D2] hover:bg-gray-50 even:bg-[#FAFAFA] transition-colors"
                    >
                      {Object.keys(row).map((header) => (
                        <td
                          key={header}
                          className="p-3 text-sm font-mono text-[#252420] border-r border-[#DDD9D2] max-w-[200px] truncate"
                          title={String(row[header])}
                        >
                          {row[header] === null ? (
                            <span className="text-[#9B9589] italic">null</span>
                          ) : (
                            String(row[header])
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* PAGINATION CONTROLS */}
          {activeChat &&
            !activeChat.loading &&
            activeChat.results &&
            activeChat.results.length > resultLimit && (
              <div className="flex items-center justify-between mt-4 text-sm text-[#9B9589]">
                <div className="flex items-center space-x-2">
                  <span>Show</span>
                  <select
                    value={resultLimit}
                    onChange={(e) => {
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
                    onClick={() =>
                      setResultPage((prev) => Math.max(prev - 1, 1))
                    }
                    className="px-3 py-1 bg-white hover:bg-[#F5F4F0] border border-[#DDD9D2] text-[#252420] disabled:opacity-50 rounded-md transition-all cursor-pointer"
                  >
                    Previous
                  </button>
                  <span>
                    Page{" "}
                    <strong className="text-[#252420]">{resultPage}</strong> of{" "}
                    <strong className="text-[#252420]">{totalPages}</strong>
                  </span>
                  <button
                    disabled={resultPage === totalPages}
                    onClick={() =>
                      setResultPage((prev) => Math.min(prev + 1, totalPages))
                    }
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
  );
}

export default ResultsPanel;
