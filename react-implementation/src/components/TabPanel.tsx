import React, { useState } from 'react';
import styled from 'styled-components';

const TabContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
`;

const TabList = styled.div`
  display: flex;
  gap: 0.5rem;
  padding: 0.5rem;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 8px 8px 0 0;
`;

const TabButton = styled.button<{ $active: boolean }>`
  padding: 0.75rem 1.25rem;
  border: none;
  border-radius: 6px;
  background: ${props => props.$active ? 
    'linear-gradient(135deg, var(--primary-color) 0%, var(--secondary-color) 100%)' : 
    'rgba(0, 0, 0, 0.2)'
  };
  color: ${props => props.$active ? 'white' : 'var(--text-muted)'};
  cursor: pointer;
  transition: all 0.2s ease;
  font-weight: ${props => props.$active ? '600' : '400'};
  font-size: 0.9rem;

  &:hover {
    background: ${props => props.$active ? 
      'linear-gradient(135deg, var(--primary-color) 0%, var(--secondary-color) 100%)' : 
      'rgba(0, 0, 0, 0.3)'
    };
    transform: translateY(-1px);
  }
`;

const TabContent = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
  background: rgba(0, 0, 0, 0.1);
  border-radius: 0 0 8px 8px;

  /* Custom scrollbar */
  &::-webkit-scrollbar {
    width: 8px;
  }

  &::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.1);
    border-radius: 4px;
  }

  &::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 4px;
    
    &:hover {
      background: rgba(255, 255, 255, 0.2);
    }
  }
`;

interface Tab {
  id: string;
  label: string;
  content: React.ReactNode;
}

interface TabPanelProps {
  tabs: Tab[];
  defaultTab?: string;
}

const TabPanel: React.FC<TabPanelProps> = ({ tabs, defaultTab }) => {
  const [activeTab, setActiveTab] = useState(defaultTab || tabs[0].id);

  return (
    <TabContainer>
      <TabList>
        {tabs.map(tab => (
          <TabButton
            key={tab.id}
            $active={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </TabButton>
        ))}
      </TabList>
      <TabContent>
        {tabs.find(tab => tab.id === activeTab)?.content}
      </TabContent>
    </TabContainer>
  );
};

export default TabPanel; 