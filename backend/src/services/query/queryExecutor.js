/**
 * Execute MongoDB queries represented as strings.
 * Expected format: db.collectionName.find({...}) or db.collectionName.aggregate([...])
 */
export const executeMongoQuery = async (connection, queryStr) => {
  const mongoRegex = /db\.([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)\(([\s\S]*)\)/;
  const match = queryStr.match(mongoRegex);
  if (!match) {
    throw new Error("Invalid MongoDB query format. Expected: db.collectionName.method(...)");
  }

  const collectionName = match[1];
  const method = match[2];
  const argsStr = match[3].trim();

  const collection = connection.collection(collectionName);

  if (typeof collection[method] !== "function") {
    throw new Error(`MongoDB collection does not support method "${method}"`);
  }

  let args = [];
  if (argsStr) {
    try {
      // Evaluate relaxed JSON/JS objects safely
      args = new Function(`return [${argsStr}]`)();
    } catch (e) {
      try {
        args = [JSON.parse(argsStr)];
      } catch (err) {
        throw new Error("Failed to parse MongoDB query arguments: " + e.message);
      }
    }
  }

  const cursor = collection[method](...args);

  if (cursor && typeof cursor.toArray === "function") {
    return await cursor.toArray();
  } else if (cursor && typeof cursor.then === "function") {
    return await cursor;
  } else {
    return cursor;
  }
};
