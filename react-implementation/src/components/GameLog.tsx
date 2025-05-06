import React from 'react';
import styled from 'styled-components';

const GameLogContainer = styled.div`
  height: 200px;
  width: fit-content;
  overflow-y: auto;
  font-family: 'Courier New', Courier, monospace;
  background-color: rgba(0,0,0,0.2);
  border-radius: 8px;
  padding: 10px;
  border: 1px solid var(--panel-border);

  &::-webkit-scrollbar {
    width: 8px;
  }

  &::-webkit-scrollbar-track {
    background: rgba(0,0,0,0.1);
    border-radius: 4px;
  }

  &::-webkit-scrollbar-thumb {
    background: var(--primary-color);
    border-radius: 4px;
  }

  &::-webkit-scrollbar-thumb:hover {
    background: #2d63c4;
  }
`;

const LogEntry = styled.div<{ type?: 'info' | 'success' | 'warning' | 'special' }>`
  margin: 5px 0;
  padding: 3px;
  border-left: 3px solid ${props => {
    switch (props.type) {
      case 'info': return 'var(--primary-color)';
      case 'success': return 'var(--success-color)';
      case 'warning': return 'var(--warning-color)';
      case 'special': return 'var(--tertiary-color)';
      default: return 'transparent';
    }
  }};
  ${props => props.type === 'special' && 'font-weight: bold;'}
`;

const GameLog: React.FC = () => {
  return (
    <GameLogContainer id="gameLog">
      <LogEntry type="info">Game initialized...</LogEntry>
      <LogEntry type="success">Welcome to The Path to AGI!</LogEntry>
      <LogEntry type="warning">Start by generating compute power...</LogEntry>
      <LogEntry type="special">Your journey begins now!</LogEntry>
    </GameLogContainer>
  );
};

export default GameLog; 