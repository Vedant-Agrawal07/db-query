import {Pool} from "pg";

// const initialConnectPostgres = async (host, user, password) => {
//   const pool = new Pool({
//     user: user,
//     host: host,
//     password: password,
//     // port: 5432,   // to be decieded to add or not
//     database: 'postgres',
//     max: 10, // Maximum number of clients in the pool
//   });
//   try {
//     const { rows } = await pool.query(
//       "SELECT datname FROM pg_database WHERE datistemplate = false;"
//     );
//     await pool.end();
//     if (rows) {
//       return {
//         status: true,
//         message: `connection successful`,
//         databases: rows,
//       };
//     }
//   } catch (error) {
//     console.log(err);
//     return {
//       status: false,
//       message: "Connection failed",
//       error: err.message,
//     };
//   }
// };

const initialConnectPostgres = async (uri) => {
  const pool = new Pool({
    connectionString: uri,
    ssl: { rejectUnauthorized: false },
  });
  try {
    const { rows } = await pool.query(
      "SELECT datname FROM pg_database WHERE datistemplate = false;"
    );
    await pool.end();
    if (rows) {
      return {
        status: true,
        message: `connection successful`,
        databases: rows,
      };
    }
  } catch (error) {
    console.log(error);
    return {
      status: false,
      message: "Connection failed",
      error: error.message,
    };
  }
};

const dbPoolPostgres = async (connectionString) => {
  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: 10, // Maximum number of clients in the pool
  });
  try {
    const { rows } = await pool.query(`
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
            AND table_type = 'BASE TABLE';
        `);

    return {
      status: true,
      message: "Connection successful",
      tables: rows.length > 0 ? rows : [],
      pool: pool,
    };
  } catch (error) {
    await pool.end();

    console.log(error);
    return {
      status: false,
      message: "Failed to fetch tables",
      error: error.message,
    };
  }
};

const fetchTableDataPostgres = async (tableName, pool) => {
  const tableData = await pool.query(`SELECT * FROM "${tableName}" LIMIT 100;`);
  const fieldNames = tableData.fields.map((field) => field.name);
  return { rows: tableData.rows, columns: fieldNames };
};

const scanDbPostgres = async (pool) => {
  try {
    const { rows } = await pool.query(
      "SELECT datname FROM pg_database WHERE datistemplate = false;"
    );
    await pool.end();
    if (rows) {
      return {
        status: true,
        message: `connection successful`,
        databases: rows,
      };
    }
  } catch (error) {
    console.log(err);
    return {
      status: false,
      message: "Connection failed",
      error: err.message,
    };
  }
};

const scanTablesPostgres = async (pool) => {
  try {
    const { rows } = await pool.query(`
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
            AND table_type = 'BASE TABLE';
        `);

    return {
      status: true,

      tables: rows.length > 0 ? rows : [],
      pool: pool,
    };
  } catch (error) {
    await pool.end();

    console.log(err);
    return {
      status: false,
      message: "Failed to fetch tables",
      error: err.message,
    };
  }
};

export {
  initialConnectPostgres,
  dbPoolPostgres,
  fetchTableDataPostgres,
  scanDbPostgres,
  scanTablesPostgres,
};
