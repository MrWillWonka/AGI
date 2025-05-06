import React from 'react';
import styled from 'styled-components';
import { useGameStore } from '../store/gameStore';

const AttributesContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

const Attribute = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 1rem;
  background-color: rgba(0, 0, 0, 0.1);
  border-radius: 6px;
  transition: background-color 0.3s ease;

  &:hover {
    background-color: rgba(0, 0, 0, 0.2);
  }
`;

const AttributeHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const AttributeName = styled.span`
  font-weight: 600;
  color: var(--light-color);
  font-size: 1.1rem;
`;

const AttributeValue = styled.span`
  font-family: 'Courier New', Courier, monospace;
  background-color: rgba(0, 0, 0, 0.2);
  padding: 0.25rem 0.75rem;
  border-radius: 4px;
  font-weight: 600;
  color: var(--light-color);
`;

const ProgressContainer = styled.div`
  width: 100%;
  height: 8px;
  background-color: rgba(0, 0, 0, 0.2);
  border-radius: 4px;
  overflow: hidden;
`;

const ProgressBar = styled.div<{ $progress: number }>`
  height: 100%;
  background: linear-gradient(90deg, var(--primary-color) 0%, var(--secondary-color) 100%);
  border-radius: 4px;
  transition: width 0.3s ease;
  width: ${props => props.$progress}%;
`;

const AttributeDescription = styled.p`
  font-size: 0.9rem;
  color: var(--text-muted);
  margin: 0;
`;

// Helper to format numbers (can be moved to a utils file later)
const formatNumber = (num: number, decimals: number = 0): string => {
  return num.toFixed(decimals);
};

const AttributesDisplay: React.FC = () => {
  const attributes = useGameStore((state) => state.attributes);

  // Placeholder for progress calculation - replace with actual logic
  const calculateProgress = (value: number) => (value % 100);

  return (
    <AttributesContainer>
      <Attribute className="tooltip">
        <AttributeHeader>
          <AttributeName>Intelligence</AttributeName>
          <AttributeValue>{formatNumber(attributes.intelligence)}</AttributeValue>
        </AttributeHeader>
        <ProgressContainer>
          <ProgressBar $progress={calculateProgress(attributes.intelligence)} />
        </ProgressContainer>
        <AttributeDescription>
          Drives phase progression and unlocks systems
        </AttributeDescription>
        <span className="tooltiptext">
          Each point contributes 2% to phase progress. Required for system unlocks.
        </span>
      </Attribute>

      <Attribute className="tooltip">
        <AttributeHeader>
          <AttributeName>Creativity</AttributeName>
          <AttributeValue>{formatNumber(attributes.creativity)}</AttributeValue>
        </AttributeHeader>
        <ProgressContainer>
          <ProgressBar $progress={calculateProgress(attributes.creativity)} />
        </ProgressContainer>
        <AttributeDescription>
          Enables rare data, dream systems, and unique research
        </AttributeDescription>
        <span className="tooltiptext">
          Each point contributes 2% to phase progress. Unlocks special events and research paths.
        </span>
      </Attribute>

      <Attribute className="tooltip">
        <AttributeHeader>
          <AttributeName>Awareness</AttributeName>
          <AttributeValue>{formatNumber(attributes.awareness)}</AttributeValue>
        </AttributeHeader>
        <ProgressContainer>
          <ProgressBar $progress={calculateProgress(attributes.awareness)} />
        </ProgressContainer>
        <AttributeDescription>
          Unlocks automation, ethical logic, and event systems
        </AttributeDescription>
        <span className="tooltiptext">
          Each point contributes 3% to phase progress. Required for automation and ethical systems.
        </span>
      </Attribute>

      <Attribute className="tooltip">
        <AttributeHeader>
          <AttributeName>Efficiency</AttributeName>
          <AttributeValue>{formatNumber(attributes.efficiency, 2)}x</AttributeValue> 
        </AttributeHeader>
        <ProgressContainer>
          <ProgressBar $progress={calculateProgress(attributes.efficiency * 100)} /> 
        </ProgressContainer>
        <AttributeDescription>
          Reduces costs and increases passive scaling
        </AttributeDescription>
        <span className="tooltiptext">
          Improves resource generation and reduces costs. Affects all systems.
        </span>
      </Attribute>
    </AttributesContainer>
  );
};

export default AttributesDisplay; 