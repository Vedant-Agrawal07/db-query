import React from "react";

function ConnectionModal({
  dbType,
  setDbType,
  connectionString,
  setConnectionString,
  handleConnect,
  connectError,
  setConnectError,
  connecting
}) {
  return (
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
  );
}

export default ConnectionModal;
