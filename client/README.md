# Seren Database Viewer

A DBeaver-style database viewer for SQLite and PostgreSQL databases, with support for x402-protected queries.

## Features

### 🗄️ Database Explorer
- Tree-view navigation for databases, tables, and views
- Support for SQLite (local files or :memory:) and PostgreSQL connections
- Expandable/collapsible nodes for easy navigation
- Connection testing before saving

### 📊 Table Viewer
- **Data Tab**: View and export table data (CSV format)
- **Definition Tab**: Column information with types, constraints, and defaults
- **Indexes Tab**: View indexes and their properties
- **Foreign Keys Tab**: Explore table relationships
- **DDL Tab**: View CREATE TABLE statements

### ✍️ SQL Editor
- Monaco Editor with SQL syntax highlighting
- Connection selector for multiple databases
- Execute queries with Ctrl+Enter
- View results in a formatted table
- Execution timing and row count display

### 🎨 Modern UI
- Dark theme (VS Code-inspired)
- Resizable panels
- Multiple tabs support (SQL editors and table viewers)
- Smooth animations and transitions

## Getting Started

### 1. Start the Development Servers

```bash
# From the project root
npm run dev:web
```

This command starts both:
- Backend API server on `http://localhost:3000`
- Frontend Vite dev server on `http://localhost:5173`

### 2. Open the Application

Navigate to `http://localhost:5173` in your web browser.

### 3. Add a Database Connection

1. Click the **+ button** in the Database Explorer sidebar
2. Choose connection type:
   - **SQLite**: Enter a file path (e.g., `C:\path\to\database.db`) or use `:memory:` for testing
   - **PostgreSQL**: Enter a connection string
3. Click **Test Connection** to verify
4. Click **Save** to add the connection

### 4. Browse Your Database

- Click the **▶** icon to expand a connection
- Expand **Tables** or **Views** folders
- **Double-click** a table to open it in the Table Viewer

### 5. Run SQL Queries

1. The default SQL Editor tab is already open
2. Select a connection from the dropdown
3. Write your SQL query
4. Click **Run** or press **Ctrl+Enter**
5. View results below the editor

## Testing with SQLite

To quickly test with an in-memory database:

1. Add new connection with file path: `:memory:`
2. Open the SQL Editor
3. Create a test table:
   ```sql
   CREATE TABLE users (
     id INTEGER PRIMARY KEY,
     name TEXT NOT NULL,
     email TEXT UNIQUE
   );
   
   INSERT INTO users (name, email) VALUES
     ('Alice', 'alice@example.com'),
     ('Bob', 'bob@example.com');
   ```
4. Execute the query
5. Refresh the Database Explorer
6. Double-click the `users` table to view it

## Testing with Your Local Database

If you want to view your `agent_datasources` database mentioned in the implementation plan:

1. Add a new SQLite connection
2. Enter the full path to your database file
3. Test and save the connection
4. Expand the connection in the tree
5. View tables and data

## API Endpoints

The backend provides these SQLite endpoints:

- `POST /api/sqlite/connect` - Test connection
- `POST /api/sqlite/execute` - Execute SQL query
- `GET /api/sqlite/tables` - List tables
- `GET /api/sqlite/schema/:table` - Get table schema
- `GET /api/sqlite/indexes/:table` - Get table indexes
- `GET /api/sqlite/foreign-keys/:table` - Get foreign keys

## Tech Stack

### Backend
- Express.js
- better-sqlite3 (SQLite driver)
- pg (PostgreSQL driver)
- Zod (validation)

### Frontend
- React 18
- TypeScript
- Monaco Editor (VS Code's editor)
- Axios
- Lucide React (icons)
- Vite (build tool)

## Future Enhancements

- Resizable panels (using react-resizable-panels)
- Virtualized scrolling for large datasets (using react-window)
- SQL formatter integration
- Query history and favorites
- Data editing capabilities
- Export to JSON format
- Multiple result sets support
- Auto-completion for table and column names
