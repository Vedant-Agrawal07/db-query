/**
 * Helper to fetch tables and their columns in a single run.
 */
export const fetchFullSchema = async (connection, dbType) => {
  if (dbType === "mySql") {
    const [rows] = await connection.query(`
      SELECT TABLE_NAME as tableName, COLUMN_NAME as columnName
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
    `);
    const schemaMap = {};
    rows.forEach(r => {
      const table = r.tableName;
      const col = r.columnName;
      if (!schemaMap[table]) schemaMap[table] = [];
      schemaMap[table].push(col);
    });
    return Object.keys(schemaMap).map(table => ({
      table,
      columns: schemaMap[table]
    }));
  } else if (dbType === "postgres" || dbType === "postgreSql") {
    const { rows } = await connection.query(`
      SELECT table_name as "tableName", column_name as "columnName"
      FROM information_schema.columns
      WHERE table_schema = 'public'
    `);
    const schemaMap = {};
    rows.forEach(r => {
      const table = r.tableName;
      const col = r.columnName;
      if (!schemaMap[table]) schemaMap[table] = [];
      schemaMap[table].push(col);
    });
    return Object.keys(schemaMap).map(table => ({
      table,
      columns: schemaMap[table]
    }));
  } else if (dbType === "mongoDb") {
    const collections = await connection.listCollections().toArray();
    const schema = [];
    for (const col of collections) {
      const colName = col.name;
      // Fetch a sample document to discover fields
      const doc = await connection.collection(colName).findOne();
      const columns = doc ? Object.keys(doc) : [];
      schema.push({ table: colName, columns });
    }
    return schema;
  }
  return [];
};
