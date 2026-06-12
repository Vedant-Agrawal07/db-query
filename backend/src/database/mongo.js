import { MongoClient } from "mongodb";

const initalConnectMongo = async (uri) => {
  const client = new MongoClient(uri, { useUnifiedTopology: true });
  try {
    await client.connect();

    const adminDb = client.db().admin();
    const { databases } = await adminDb.listDatabases();

    await client.close();

    return {
      status: true,
      message: "Connection successful",
      databases: databases.length > 0 ? databases : [],
    };
  } catch (err) {
    console.log(err);
    return {
      status: false,
      message: "Connection failed",
      error: err.message,
    };
  }
};

// Connect to a specific database and get collections
const dbPoolMongo = async (connectionString) => {
  const client = new MongoClient(connectionString, { useUnifiedTopology: true });
  try {
    await client.connect();
    const db = client.db(); // Uses the database name specified in the connection string
    const collections = await db.listCollections().toArray();

    return {
      status: true,
      message: "Connection successful",
      collections: collections.length > 0 ? collections : [],
      client: db, // keep client to reuse for queries
    };
  } catch (err) {
    await client.close();
    console.log(err);
    return {
      status: false,
      message: "Failed to fetch collections",
      error: err.message,
    };
  }
};

// Fetch documents and schema info (field names) from a collection
const fetchCollectionData = async (collectionName, dbClient) => {
  // const db = dbClient.db(dbName);
  const collection = dbClient.collection(collectionName);

  const rows = await collection.find({}).limit(100).toArray(); // limit for safety
  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

  return { rows, columns };
};

// Scan databases in an existing client
const scanDbMongo = async (client) => {
  const adminDb = client.db().admin();
  const { databases } = await adminDb.listDatabases();
  return {
    status: true,
    message: "Connection successful",
    databases: databases.length > 0 ? databases : [],
  };
};

// Scan collections in a database using an existing client
const scanCollections = async (client, dbName) => {
  const db = client.db(dbName);
  const collections = await db.listCollections().toArray();
  return {
    status: true,
    message: `tables in database ${dbName}`,
    tables: collections.length > 0 ? collections : [],
  };
};

export {
  initalConnectMongo,
  dbPoolMongo,
  fetchCollectionData,
  scanDbMongo,
  scanCollections,
};
