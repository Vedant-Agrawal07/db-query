import { filterSchema } from "./services/schemaFilter.js";
import { buildPrompt } from "./services/promptBuilder.js";
import { validateQuery } from "./services/safetyValidator.js";

// Mock Database Schema
const mockSchema = [
  {
    table: "users",
    columns: ["id", "name", "email", "status", "created_at"]
  },
  {
    table: "orders",
    columns: ["id", "user_id", "total_price", "order_date", "status"]
  },
  {
    table: "products",
    columns: ["id", "title", "price", "stock_qty", "category"]
  }
];

console.log("=== STARTING PIPELINE VERIFICATION TESTS ===\n");

// 1. Schema Filter Test
const question = "find active users who bought a product with total price greater than 100";
console.log(`[Test 1] User Question: "${question}"`);
const filtered = filterSchema(mockSchema, question);
console.log("Filtered Schema Result:");
console.log(JSON.stringify(filtered, null, 2));
console.log("=========================================\n");

// 2. Prompt Builder Test
console.log("[Test 2] Building Gemini prompt...");
const prompt = buildPrompt("mySql", filtered, question);
console.log("Generated Prompt Snippet (first 400 chars):");
console.log(prompt.substring(0, 400) + "...\n");
console.log("=========================================\n");

// 3. Safety Validator Tests
console.log("[Test 3] Testing Safety Validator...");

// Case A: Safe SELECT
const safeSQL = "SELECT u.name, o.total_price FROM users u JOIN orders o ON u.id = o.user_id WHERE o.total_price > 100;";
const valSafe = validateQuery(safeSQL, "mySql", mockSchema);
console.log(`\nQuery: "${safeSQL}"`);
console.log("Result (Expected: isValid=true, executable=true, warning=null):", valSafe);

// Case B: Dangerous DROP
const dangerousSQL = "DROP TABLE users;";
const valDangerous = validateQuery(dangerousSQL, "mySql", mockSchema);
console.log(`\nQuery: "${dangerousSQL}"`);
console.log("Result (Expected: isValid=true, executable=false, warning containing DROP):", valDangerous);

// Case C: Invalid Column Reference
const invalidColSQL = "SELECT u.non_existent_column, o.total_price FROM users u JOIN orders o ON u.id = o.user_id;";
const valInvalidCol = validateQuery(invalidColSQL, "mySql", mockSchema);
console.log(`\nQuery: "${invalidColSQL}"`);
console.log("Result (Expected: isValid=true, executable=false, warning for column exist):", valInvalidCol);

// Case D: Invalid Table Reference
const invalidTableSQL = "SELECT name FROM fake_table;";
const valInvalidTable = validateQuery(invalidTableSQL, "mySql", mockSchema);
console.log(`\nQuery: "${invalidTableSQL}"`);
console.log("Result (Expected: isValid=true, executable=false, warning for table fake_table):", valInvalidTable);

console.log("\n=== VERIFICATION TESTS COMPLETED ===");
