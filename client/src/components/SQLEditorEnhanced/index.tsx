import React, { useState } from 'react';
import Editor from '@monaco-editor/react';
import { Play, Square } from 'lucide-react';
import { useDatabaseContext } from '../../contexts/DatabaseContext';
import { useDatabaseConnection } from '../../hooks/useDatabaseConnection';
import './SQLEditorEnhanced.css';

export function SQLEditorEnhanced() {
    const { connections, activeConnection, theme } = useDatabaseContext();
    const { executeSqliteQuery, executeDirectQuery } = useDatabaseConnection();
    const [sql, setSql] = useState('-- Enter your SQL query here\nSELECT * FROM sqlite_master;');
    const [executing, setExecuting] = useState(false);
    const [results, setResults] = useState<any>(null);
    const [selectedConnection, setSelectedConnection] = useState<string>('');

    const handleExecute = async () => {
        if (!selectedConnection) {
            setResults({
                success: false,
                error: 'Please select a connection first',
            });
            return;
        }

        const connection = connections.find((c) => c.id === selectedConnection);
        if (!connection) {
            setResults({
                success: false,
                error: 'Connection not found',
            });
            return;
        }

        setExecuting(true);
        setResults(null);

        try {
            let result;
            if (connection.type === 'sqlite' && connection.filePath) {
                result = await executeSqliteQuery(connection.filePath, sql);
            } else if (connection.type === 'postgres' && connection.connectionString) {
                result = await executeDirectQuery(connection.connectionString, sql);
            }

            setResults(result);
        } catch (err: any) {
            setResults({
                success: false,
                error: err.message,
            });
        } finally {
            setExecuting(false);
        }
    };

    const handleStop = () => {
        // In a real implementation, this would cancel the query
        setExecuting(false);
    };

    return (
        <div className="sql-editor-enhanced">
            <div className="sql-editor-toolbar">
                <select
                    className="connection-selector"
                    value={selectedConnection}
                    onChange={(e) => setSelectedConnection(e.target.value)}
                >
                    <option value="">Select Connection...</option>
                    {connections.map((conn) => (
                        <option key={conn.id} value={conn.id}>
                            {conn.name} ({conn.type})
                        </option>
                    ))}
                </select>

                <div className="toolbar-actions">
                    {!executing ? (
                        <button
                            className="run-button" onClick={handleExecute}
                            disabled={!selectedConnection}
                            title="Run Query (Ctrl+Enter)"
                        >
                            <Play size={16} />
                            Run
                        </button>
                    ) : (
                        <button className="stop-button" onClick={handleStop} title="Stop Query">
                            <Square size={16} />
                            Stop
                        </button>
                    )}
                </div>
            </div>

            <div className="editor-container">
                <Editor
                    height="100%"
                    defaultLanguage="sql"
                    value={sql}
                    onChange={(value) => setSql(value || '')}
                    theme={theme === 'dark' ? 'vs-dark' : 'light'}
                    options={{
                        minimap: { enabled: false },
                        fontSize: 13,
                        lineNumbers: 'on',
                        roundedSelection: true,
                        scrollBeyondLastLine: false,
                        automaticLayout: true,
                    }}
                />
            </div>

            {results && (
                <div className="results-section">
                    <div className="results-header">
                        <h4>Results</h4>
                        {results.success && results.executionTime && (
                            <span className="execution-time">
                                {results.executionTime}ms • {results.rowCount || 0} rows
                            </span>
                        )}
                    </div>

                    {results.success ? (
                        results.rows && results.rows.length > 0 ? (
                            <div className="results-table-container">
                                <table className="results-table">
                                    <thead>
                                        <tr>
                                            {Object.keys(results.rows[0]).map((col) => (
                                                <th key={col}>{col}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {results.rows.map((row: any, idx: number) => (
                                            <tr key={idx}>
                                                {Object.keys(results.rows[0]).map((col) => (
                                                    <td key={col}>{JSON.stringify(row[col])}</td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="no-results">
                                Query executed successfully. {results.rowCount || 0} rows affected.
                            </div>
                        )
                    ) : (
                        <div className="error-message">{results.error}</div>
                    )}
                </div>
            )}
        </div>
    );
}
