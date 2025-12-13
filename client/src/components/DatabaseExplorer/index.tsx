import React, { useState, useEffect } from 'react';
import { Database, FolderOpen, Table, Plus, RefreshCw, ChevronRight, ChevronDown } from 'lucide-react';
import { useDatabaseContext } from '../../contexts/DatabaseContext';
import { useDatabaseConnection } from '../../hooks/useDatabaseConnection';
import './DatabaseExplorer.css';

interface TreeNode {
    id: string;
    label: string;
    type: 'connection' | 'folder' | 'table' | 'view';
    children?: TreeNode[];
    expanded?: boolean;
    connection?: any;
    tableName?: string;
}

export function DatabaseExplorer() {
    const { connections, addConnection, activeConnection, setActiveConnection, addTab } = useDatabaseContext();
    const { listSqliteTables, listPostgresTables } = useDatabaseConnection();
    const [treeNodes, setTreeNodes] = useState<TreeNode[]>([]);
    const [showAddDialog, setShowAddDialog] = useState(false);

    // Build tree structure from connections
    useEffect(() => {
        const buildTree = async () => {
            const nodes: TreeNode[] = [];

            for (const conn of connections) {
                const connectionNode: TreeNode = {
                    id: conn.id,
                    label: conn.name,
                    type: 'connection',
                    connection: conn,
                    expanded: false,
                    children: [],
                };

                if (conn.type === 'sqlite' && conn.filePath) {
                    // Load tables for SQLite connections
                    const tables = await listSqliteTables(conn.filePath);

                    const tablesFolder: TreeNode = {
                        id: `${conn.id}-tables`,
                        label: 'Tables',
                        type: 'folder',
                        expanded: false,
                        children: tables
                            .filter((t: any) => t.type === 'table')
                            .map((t: any) => ({
                                id: `${conn.id}-table-${t.name}`,
                                label: t.name,
                                type: 'table' as const,
                                connection: conn,
                                tableName: t.name,
                            })),
                    };

                    const viewsFolder: TreeNode = {
                        id: `${conn.id}-views`,
                        label: 'Views',
                        type: 'folder',
                        expanded: false,
                        children: tables
                            .filter((t: any) => t.type === 'view')
                            .map((t: any) => ({
                                id: `${conn.id}-view-${t.name}`,
                                label: t.name,
                                type: 'view' as const,
                                connection: conn,
                                tableName: t.name,
                            })),
                    };

                    connectionNode.children = [tablesFolder, viewsFolder];
                } else if (conn.type === 'postgres' && conn.connectionString) {
                    // Load tables for PostgreSQL connections
                    const tables = await listPostgresTables(conn.connectionString);

                    const tablesFolder: TreeNode = {
                        id: `${conn.id}-tables`,
                        label: 'Tables',
                        type: 'folder',
                        expanded: false,
                        children: tables
                            .filter((t: any) => t.type === 'BASE TABLE')
                            .map((t: any) => ({
                                id: `${conn.id}-table-${t.name}`,
                                label: t.name,
                                type: 'table' as const,
                                connection: conn,
                                tableName: t.name,
                            })),
                    };

                    const viewsFolder: TreeNode = {
                        id: `${conn.id}-views`,
                        label: 'Views',
                        type: 'folder',
                        expanded: false,
                        children: tables
                            .filter((t: any) => t.type === 'VIEW')
                            .map((t: any) => ({
                                id: `${conn.id}-view-${t.name}`,
                                label: t.name,
                                type: 'view' as const,
                                connection: conn,
                                tableName: t.name,
                            })),
                    };

                    connectionNode.children = [tablesFolder, viewsFolder];
                }

                nodes.push(connectionNode);
            }

            setTreeNodes(nodes);
        };

        buildTree();
    }, [connections]);

    const toggleNode = (nodeId: string) => {
        const toggleRecursive = (nodes: TreeNode[]): TreeNode[] => {
            return nodes.map((node) => {
                if (node.id === nodeId) {
                    return { ...node, expanded: !node.expanded };
                }
                if (node.children) {
                    return { ...node, children: toggleRecursive(node.children) };
                }
                return node;
            });
        };
        setTreeNodes(toggleRecursive(treeNodes));
    };

    const handleNodeClick = (node: TreeNode) => {
        if (node.type === 'connection' || node.type === 'folder') {
            toggleNode(node.id);
        } else if (node.type === 'table' || node.type === 'view') {
            // Open table viewer tab
            addTab({
                id: `table-${node.connection.id}-${node.tableName}`,
                title: node.tableName || 'Table',
                type: 'table-viewer',
                connection: node.connection,
                tableName: node.tableName,
            });
        }
    };

    const renderTreeNode = (node: TreeNode, depth: number = 0): React.ReactNode => {
        const hasChildren = node.children && node.children.length > 0;
        const Icon = node.type === 'connection' ? Database : node.type === 'folder' ? FolderOpen : Table;

        return (
            <div key={node.id}>
                <div
                    className="tree-node"
                    style={{ paddingLeft: `${depth * 16 + 8}px` }}
                    onClick={() => handleNodeClick(node)}
                >
                    {hasChildren && (
                        <span className="tree-node-icon">
                            {node.expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        </span>
                    )}
                    <Icon size={16} className="tree-node-type-icon" />
                    <span className="tree-node-label">{node.label}</span>
                </div>
                {node.expanded && node.children && (
                    <div className="tree-node-children">
                        {node.children.map((child) => renderTreeNode(child, depth + 1))}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="database-explorer">
            <div className="database-explorer-header">
                <h3>Database Explorer</h3>
                <div className="database-explorer-actions">
                    <button
                        className="icon-button"
                        onClick={() => setShowAddDialog(true)}
                        title="Add Connection"
                    >
                        <Plus size={16} />
                    </button>
                    <button className="icon-button" title="Refresh">
                        <RefreshCw size={16} />
                    </button>
                </div>
            </div>

            <div className="tree-view">
                {treeNodes.length === 0 ? (
                    <div className="empty-state">
                        <p>No connections</p>
                        <button onClick={() => setShowAddDialog(true)}>Add Connection</button>
                    </div>
                ) : (
                    treeNodes.map((node) => renderTreeNode(node))
                )}
            </div>

            {showAddDialog && (
                <ConnectionDialog onClose={() => setShowAddDialog(false)} />
            )}
        </div>
    );
}

function ConnectionDialog({ onClose }: { onClose: () => void }) {
    const { addConnection } = useDatabaseContext();
    const { testSqliteConnection } = useDatabaseConnection();
    const [connectionType, setConnectionType] = useState<'sqlite' | 'postgres'>('sqlite');
    const [name, setName] = useState('');
    const [filePath, setFilePath] = useState('');
    const [connectionString, setConnectionString] = useState('');
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<string | null>(null);

    const handleTest = async () => {
        setTesting(true);
        setTestResult(null);

        if (connectionType === 'sqlite') {
            const success = await testSqliteConnection(filePath);
            setTestResult(success ? 'Connection successful!' : 'Connection failed');
        }

        setTesting(false);
    };

    const handleSave = () => {
        const connection = {
            id: `conn-${Date.now()}`,
            name: name || (connectionType === 'sqlite' ? 'SQLite DB' : 'PostgreSQL DB'),
            type: connectionType,
            filePath: connectionType === 'sqlite' ? filePath : undefined,
            connectionString: connectionType === 'postgres' ? connectionString : undefined,
        };

        addConnection(connection);
        onClose();
    };

    return (
        <div className="dialog-overlay" onClick={onClose}>
            <div className="dialog" onClick={(e) => e.stopPropagation()}>
                <h2>New Database Connection</h2>

                <div className="form-group">
                    <label>Connection Type:</label>
                    <select
                        value={connectionType}
                        onChange={(e) => setConnectionType(e.target.value as 'sqlite' | 'postgres')}
                    >
                        <option value="sqlite">SQLite</option>
                        <option value="postgres">PostgreSQL</option>
                    </select>
                </div>

                <div className="form-group">
                    <label>Connection Name:</label>
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="My Database"
                    />
                </div>

                {connectionType === 'sqlite' && (
                    <div className="form-group">
                        <label>File Path:</label>
                        <input
                            type="text"
                            value={filePath}
                            onChange={(e) => setFilePath(e.target.value)}
                            placeholder="C:\path\to\database.db or :memory:"
                        />
                        <small>Use :memory: for an in-memory database</small>
                    </div>
                )}

                {connectionType === 'postgres' && (
                    <div className="form-group">
                        <label>Connection String:</label>
                        <input
                            type="text"
                            value={connectionString}
                            onChange={(e) => setConnectionString(e.target.value)}
                            placeholder="postgresql://user:password@host:port/database"
                        />
                    </div>
                )}

                {testResult && (
                    <div className={`test-result ${testResult.includes('successful') ? 'success' : 'error'}`}>
                        {testResult}
                    </div>
                )}

                <div className="dialog-actions">
                    <button onClick={handleTest} disabled={testing}>
                        {testing ? 'Testing...' : 'Test Connection'}
                    </button>
                    <button onClick={handleSave} className="primary">
                        Save
                    </button>
                    <button onClick={onClose}>Cancel</button>
                </div>
            </div>
        </div>
    );
}
