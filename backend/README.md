# Database AI Backend

## Project Overview

The Database AI Backend is a powerful Node.js application that bridges the gap between natural language and database queries. It allows users to connect to various databases (PostgreSQL, MySQL, MongoDB), explore their schemas, and seamlessly generate and execute queries using conversational language powered by Google's Gemini AI. The system ensures robust safety by validating queries and classifying execution risks before any operation touches the database.

## Features

- **Natural language to query generation**: Translate plain English into valid SQL or MongoDB MQL queries using Gemini 2.5 Flash.
- **PostgreSQL support**: Native integration for PostgreSQL databases.
- **MySQL support**: Native integration for MySQL databases.
- **MongoDB support**: Native integration for MongoDB document databases.
- **Query validation**: Ensures queries only reference valid tables and columns present in your database.
- **Risk classification**: Automatically labels queries as SAFE, READ_ONLY, MODIFIES_DATA, MODIFIES_SCHEMA, or HIGH_RISK.
- **Safe execution workflows**: Blocks high-risk actions (e.g., DROP, TRUNCATE) while allowing approved modifications to run smoothly.
- **Schema explorer**: Automatically fetches and maps your database tables and columns for an interactive UI tree.
- **Data explorer**: Run queries and visualize the resulting rows and columns directly from the frontend.

## Architecture

The backend request lifecycle follows a structured flow from the user to the database:

**Frontend**
↓
**API Layer** *(Express routers & controllers handling the request)*
↓
**Gemini Query Service** *(Building context-aware prompts & talking to GenAI)*
↓
**Validation Layer** *(Checking schema references & classifying risk)*
↓
**Execution Layer** *(Running the approved query via appropriate DB driver)*
↓
**Database** *(MySQL, PostgreSQL, or MongoDB instance)*

## Folder Structure

The application follows a clean, modular structure separating configuration, services, logic, and routing:

```
backend/
├── package.json
├── package-lock.json
├── .env
└── src/
    ├── server.js               # Entry point, Express app setup, routing, and server start
    ├── config/                 
    │   ├── env.js              # Environment variable loader
    │   └── poolStore.js        # In-memory session store for database connections
    ├── routes/
    │   └── userRoutes.js       # Main API routing
    ├── controllers/
    │   ├── databaseController.js # Handles DB connections, schema fetching, and scanning
    │   └── queryController.js    # Handles AI query generation and execution
    ├── services/
    │   ├── gemini/
    │   │   ├── geminiService.js  # Communicates directly with the Gemini API
    │   │   └── promptBuilder.js  # Constructs structured prompts with schema context
    │   ├── query/
    │   │   ├── queryExecutor.js  # Dedicated logic for executing complex queries (e.g. Mongo MQL)
    │   │   └── riskClassifier.js # Scans queries to determine execution risk
    │   └── databaseService.js    # Standardized helper for fetching DB schemas
    ├── database/
    │   ├── postgres.js         # PostgreSQL connection and pool management
    │   ├── mysql.js            # MySQL connection and pool management
    │   └── mongo.js            # MongoDB connection and pool management
    ├── validators/
    │   └── safetyValidator.js  # Cross-checks generated queries against schema and safety rules
    └── utils/
        └── schemaFilter.js     # Trims down large schemas to send relevant data to Gemini
```

## Environment Variables

The backend relies on the following environment variables. Create a `.env` file in the `backend/` directory:

```env
PORT=8125
GEMINI_API_KEY=your_google_gemini_api_key_here
```

## Local Setup

1. **Clone the repository** and navigate to the `backend` folder.
2. **Install dependencies**:
   ```bash
   npm install
   ```
3. **Set up environment variables**:
   Create a `.env` file and supply the required variables.

## Run Commands

To start the application in development mode (with hot-reloading):
```bash
npm start
```

This will run the server using `nodemon`. The API will be available at `http://localhost:8125`.
