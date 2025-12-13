import React from 'react';
import { X } from 'lucide-react';
import { useDatabaseContext } from '../../contexts/DatabaseContext';
import { SQLEditorEnhanced } from '../SQLEditorEnhanced';
import { TableViewer } from '../TableViewer';
import DirectConnection from '../DirectConnection';
import './TabbedInterface.css';

export function TabbedInterface() {
    const { tabs, activeTabId, setActiveTabId, removeTab } = useDatabaseContext();

    const handleTabClose = (e: React.MouseEvent, tabId: string) => {
        e.stopPropagation();
        removeTab(tabId);
    };

    const renderTabContent = () => {
        const activeTab = tabs.find((t) => t.id === activeTabId);
        if (!activeTab) return null;

        switch (activeTab.type) {
            case 'sql-editor':
                return <SQLEditorEnhanced />;
            case 'table-viewer':
                return activeTab.connection && activeTab.tableName ? (
                    <TableViewer
                        connection={activeTab.connection}
                        tableName={activeTab.tableName}
                    />
                ) : (
                    <div>Invalid table viewer configuration</div>
                );
            case 'direct-connection':
                return <DirectConnection />;
            default:
                return <div>Unknown tab type</div>;
        }
    };

    return (
        <div className="tabbed-interface">
            <div className="tabs-bar">
                {tabs.map((tab) => (
                    <div
                        key={tab.id}
                        className={`tab-item ${tab.id === activeTabId ? 'active' : ''}`}
                        onClick={() => setActiveTabId(tab.id)}
                    >
                        <span className="tab-title">{tab.title}</span>
                        {tabs.length > 1 && (
                            <button
                                className="tab-close"
                                onClick={(e) => handleTabClose(e, tab.id)}
                                title="Close tab"
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>
                ))}
            </div>

            <div className="tab-content">{renderTabContent()}</div>
        </div>
    );
}
