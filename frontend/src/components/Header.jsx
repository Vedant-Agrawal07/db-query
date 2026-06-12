import React from "react";
import { Brain } from "lucide-react";

function Header({ isConnected, dbType, database, handleDisconnect }) {
  return (
    <header className="flex items-center justify-between px-6 py-4 bg-white border-b border-[#DDD9D2]">
      <div className="flex items-center space-x-3">
        <div className="w-10 h-10 rounded-xl bg-[#4A7C59] flex items-center justify-center">
          <Brain className="h-6 w-6 text-white" />
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
  );
}

export default Header;
