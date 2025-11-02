// import mysql from "mysql2";
import mysql from "mysql2/promise";

// Create the connection pool. The pool-specific settings are the defaults

const initalConnect = async (host, user, password) => {
  const pool = mysql.createPool({
    host: host,
    user: user,
    password: password,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  });
  try {
    const [databases] = await pool.query("SHOW DATABASES");
    await pool.end();
    if (databases) {
      return {
        status: true,
        message: `connection successful`,
        databases: databases,
      };
    } else {
      return {
        message: "NO DATABASE FOUND PLEASE RUN THE FOLLOWING SQL :",
        snippet: `CREATE DATABASE your_db_name`,
      };
    }
  } catch (err) {
    await pool.end();
    console.log(err);
    if (err.code === "ER_DBACCESS_DENIED_ERROR") {
      return {
        status: false,
        message: "Read permission missing. Run the following SQL:",
        snippet: `
        CREATE USER 'user'@'%' IDENTIFIED BY 'password';
        GRANT SELECT ON *.* TO 'user'@'%';
        FLUSH PRIVILEGES;
      `,
      };
    } else if (err.code === "ER_ACCESS_DENIED_ERROR") {
      return {
        status: false,
        message: "ACCESS DENIED PLEASE ENTER CORRECT CREDENTIALS",
      };
    } else {
      return {
        status: false,
        message: "Connection failed due to unexpected error",
        error: err.message,
      };
    }
  }
};

const dbPool = async (host, user, password, database) => {
  const pool = mysql.createPool({
    host: host,
    user: user,
    password: password,
    database: database,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  });
  try {
    const [tables] = await pool.query("SHOW TABLES");

    return {
      status: true,
      message: `connection successful to database ${database}`,
      tables: tables.length > 0 ? tables : [],
      pool: pool,
    };

    // return { tables, pool };
  } catch (err) {
    await pool.end();

    console.log(err);
    return {
      status: false,
      message: "Failed to fetch tables",
      error: err.message,
    };
  }
};

const fetchTableData = async (tableName, pool) => {
  const [rows] = await pool.query(`SELECT * FROM \`${tableName}\``);
  const [columns] = await pool.query(`DESC \`${tableName}\``);
  return { rows: rows, columns: columns };
};

const scanDb = async (pool) => {
  const [databases] = await pool.query("SHOW DATABASES");
   return {
     status: true,
     message: `connection successful`,
     databases: databases,
   };
};
const scanTables = async (pool ) => {
  const [tables] = await pool.query("SHOW TABLES");
   return {
     status: true,
     message: `connection successful`,
     tables: tables.length > 0 ? tables : [],
   };
};



export { initalConnect, dbPool, fetchTableData, scanDb, scanTables };
