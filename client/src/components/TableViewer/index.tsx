import React, { useState, useEffect } from 'react';
import { Table, FileText, Key, Link, Download } from 'lucide-react';
import { useDatabaseConnection } from '../../hooks/useDatabaseConnection';
import { Connection } from '../../contexts/DatabaseContext';
import './TableViewer.css';

interface TableViewerProps {
    connection: Connection;
    tableName: string;
}

type TabType = 'data' | 'definition' | 'indexes' | 'foreign-keys' | 'ddl';

export function TableViewer({ connection, tableName }: TableViewerProps) {
    const [activeTab, setActiveTab] = useState<TabType>('data');
    const [tableData, setTableData] = useState<any[]>([]);
    const [columns, setColumns] = useState<any[]>([]);
    const [indexes, setIndexes] = useState<any[]>([]);
    const [foreignKeys, setForeignKeys] = useState<any[]>([]);
    const [ddl, setDdl] = useState('');
    const [loading, setLoading] = useState(false);
    const {
        executeSqliteQuery,
        getSqliteTableSchema,
        getSqliteIndexes,
        getSqliteForeignKeys,
        getPostgresTableData,
        getPostgresTableSchema,
        getPostgresIndexes,
        getPostgresForeignKeys,
    } = useDatabaseConnection();

    useEffect(() => {
        loadTableData();
        loadTableSchema();
        loadIndexes();
        loadForeignKeys();
    }, [connection, tableName]);

    const loadTableData = async () => {
        setLoading(true);
        if (connection.type === 'sqlite' && connection.filePath) {
            const result = await executeSqliteQuery(
                connection.filePath,
                `SELECT * FROM ${tableName} LIMIT 100`
            );
            if (result.success && result.rows) {
                setTableData(result.rows);
            }
        } else if (connection.type === 'postgres' && connection.connectionString) {
            const result = await getPostgresTableData(connection.connectionString, tableName);
            if (result.success && result.rows) {
                setTableData(result.rows);
            }
        }
        setLoading(false);
    };

    const loadTableSchema = async () => {
        if (connection.type === 'sqlite' && connection.filePath) {
            const schema = await getSqliteTableSchema(connection.filePath, tableName);
            if (schema) {
                setColumns(schema.columns || []);
                setDdl(schema.ddl || '');
            }
        } else if (connection.type === 'postgres' && connection.connectionString) {
            const schema = await getPostgresTableSchema(connection.connectionString, tableName);
            if (schema) {
                setColumns(schema.columns || []);
                setDdl(schema.ddl || '');
            }
        }
    };

    const loadIndexes = async () => {
        if (connection.type === 'sqlite' && connection.filePath) {
            const idxs = await getSqliteIndexes(connection.filePath, tableName);
            setIndexes(idxs);
        } else if (connection.type === 'postgres' && connection.connectionString) {
            const idxs = await getPostgresIndexes(connection.connectionString, tableName);
            setIndexes(idxs);
        }
    };

    const loadForeignKeys = async () => {
        if (connection.type === 'sqlite' && connection.filePath) {
            const fks = await getSqliteForeignKeys(connection.filePath, tableName);
            setForeignKeys(fks);
        } else if (connection.type === 'postgres' && connection.connectionString) {
            const fks = await getPostgresForeignKeys(connection.connectionString, tableName);
            setForeignKeys(fks);
        }
    };

    const exportToCsv = () => {
        if (tableData.length === 0) return;

        const headers = Object.keys(tableData[0]);
        const csvContent = [
            headers.join(','),
            ...tableData.map((row) =>
                headers.map((h) => JSON.stringify(row[h] ?? '')).join(',')
            ),
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${tableName}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const renderDataTab = () => {
        if (loading) {
            return <div className="loading">Loading data...</div>;
        }

        if (tableData.length === 0) {
            return <div className="empty-message">No data in table</div>;
        }

        const columnNames = Object.keys(tableData[0]);

        return (
            <div className="data-tab">
                <div className="data-tab-toolbar">
                    <span className="row-count">{tableData.length} rows</span>
                    <button onClick={exportToCsv} className="export-button">
                        <Download size={14} />
                        Export CSV
                    </button>
                </div>
                <div className="data-grid-container">
                    <table className="data-grid">
                        <thead>
                            <tr>
                                {columnNames.map((col) => (
                                    <th key={col}>{col}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {tableData.map((row, idx) => (
                                <tr key={idx}>
                                    {columnNames.map((col) => (
                                        <td key={col}>{JSON.stringify(row[col])}</td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    const renderDefinitionTab = () => {
        if (columns.length === 0) {
            return <div className="empty-message">No column information</div>;
        }

        return (
            <div className="definition-tab">
                <table className="definition-table">
                    <thead>
                        <tr>
                            <th>Column</th>
                            <th>Type</th>
                            <th>Nullable</th>
                            <th>Default</th>
                            <th>PK</th>
                        </tr>
                    </thead>
                    <tbody>
                        {columns.map((col: any) => (
                            <tr key={col.cid}>
                                <td>{col.name}</td>
                                <td>{col.type}</td>
                                <td>{col.notnull ? 'NO' : 'YES'}</td>
                                <td>{col.dflt_value || '-'}</td>
                                <td>{col.pk ? 'YES' : 'NO'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    };

    const renderIndexesTab = () => {
        if (indexes.length === 0) {
            return <div className="empty-message">No indexes</div>;
        }

        return (
            <div className="indexes-tab">
                <table className="definition-table">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Unique</th>
                            <th>Origin</th>
                        </tr>
                    </thead>
                    <tbody>
                        {indexes.map((idx: any, i) => (
                            <tr key={i}>
                                <td>{idx.name}</td>
                                <td>{idx.unique ? 'YES' : 'NO'}</td>
                                <td>{idx.origin}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    };

    const renderForeignKeysTab = () => {
        if (foreignKeys.length === 0) {
            return <div className="empty-message">No foreign keys</div>;
        }

        return (
            <div className="fk-tab">
                <table className="definition-table">
                    <thead>
                        <tr>
                            <th>Column</th>
                            <th>References Table</th>
                            <th>References Column</th>
                            <th>On Update</th>
                            <th>On Delete</th>
                        </tr>
                    </thead>
                    <tbody>
                        {foreignKeys.map((fk: any, i) => (
                            <tr key={i}>
                                <td>{fk.from}</td>
                                <td>{fk.table}</td>
                                <td>{fk.to}</td>
                                <td>{fk.on_update}</td>
                                <td>{fk.on_delete}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    };

    const renderDdlTab = () => {
        if (!ddl) {
            return <div className="empty-message">No DDL available</div>;
        }

        return (
            <div className="ddl-tab">
                <pre className="ddl-code">{ddl}</pre>
            </div>
        );
    };

    return (
        <div className="table-viewer">
            <div className="table-viewer-header">
                <div className="table-breadcrumb">
                    <Table size={16} />
                    <span>{connection.name}</span>
                    <span className="breadcrumb-separator">›</span>
                    <span>{tableName}</span>
                </div>
            </div>

            <div className="table-viewer-tabs">
                <button
                    className={`tab ${activeTab === 'data' ? 'active' : ''}`}
                    onClick={() => setActiveTab('data')}
                >
                    Data
                </button>
                <button
                    className={`tab ${activeTab === 'definition' ? 'active' : ''}`}
                    onClick={() => setActiveTab('definition')}
                >
                    <FileText size={14} />
                    Definition
                </button>
                <button
                    className={`tab ${activeTab === 'indexes' ? 'active' : ''}`}
                    onClick={() => setActiveTab('indexes')}
                >
                    <Key size={14} />
                    Indexes
                </button>
                <button
                    className={`tab ${activeTab === 'foreign-keys' ? 'active' : ''}`}
                    onClick={() => setActiveTab('foreign-keys')}
                >
                    <Link size={14} />
                    Foreign Keys
                </button>
                <button
                    className={`tab ${activeTab === 'ddl' ? 'active' : ''}`}
                    onClick={() => setActiveTab('ddl')}
                >
                    DDL
                </button>
            </div>

            <div className="table-viewer-content">
                {activeTab === 'data' && renderDataTab()}
                {activeTab === 'definition' && renderDefinitionTab()}
                {activeTab === 'indexes' && renderIndexesTab()}
                {activeTab === 'foreign-keys' && renderForeignKeysTab()}
                {activeTab === 'ddl' && renderDdlTab()}
            </div>
        </div>
    );
}
