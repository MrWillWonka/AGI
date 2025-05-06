import React from 'react';
import styled from 'styled-components';
import { useGameStore, Attributes } from '../store/gameStore';
import { getIcon, IconConcept } from '../utils/getIcon';
import { formatNumber } from '../utils/formatNumber';

const AttributesContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

const Attribute = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem;
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
  font-weight: 500;
  font-size: 0.95rem;
  color: var(--light-color);
  display: flex;
  align-items: center;
`;

const AttributeValue = styled.span`
  font-weight: bold;
  font-size: 0.95rem;
  font-family: 'Courier New', Courier, monospace;
  background-color: rgba(0, 0, 0, 0.2);
  padding: 0.2rem 0.6rem;
  border-radius: 4px;
  color: var(--light-color);
`;

const ProgressContainer = styled.div`
  width: 100%;
  height: 6px;
  background-color: rgba(0, 0, 0, 0.2);
  border-radius: 3px;
  overflow: hidden;
  position: relative;
`;

const ProgressBar = styled.div<{ $progress: number }>`
  height: 100%;
  background: linear-gradient(90deg, var(--primary-color) 0%, var(--secondary-color) 100%);
  border-radius: 3px;
  transition: width 0.3s ease;
  width: ${props => props.$progress}%;
`;

const AttributeDescription = styled.p`
  font-size: 0.85rem;
  color: var(--text-muted);
  margin: 0.2rem 0 0 0;
`;

// Helper to format attribute names (can be moved to utils)
const formatAttributeName = (key: string): string => {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
}

const AttributesDisplay: React.FC = () => {
  const attributes = useGameStore((state) => state.attributes);

  return (
    <AttributesContainer>
      {Object.entries(attributes).map(([key, value]) => {
        // Basic progress calculation (e.g., value mod 100, needs real logic)
        const progress = (value % 100);
        const isEfficiency = key === 'efficiency';

        return (
          <Attribute key={key}>
            <AttributeHeader>
              <AttributeName>
                {getIcon(key as IconConcept)}
                {formatAttributeName(key)}
              </AttributeName>
              <AttributeValue>
                {formatNumber(value, isEfficiency ? 2 : 0)}{isEfficiency ? 'x' : ''}
              </AttributeValue>
            </AttributeHeader>
            {/* Optional: Add progress bar back if needed */}
            {/* <ProgressContainer>
              <ProgressBar $progress={progress} />
            </ProgressContainer> */}
            {/* Add description based on PRD or simple placeholder */}
            {/* <AttributeDescription>Role/Effect description...</AttributeDescription> */}
          </Attribute>
        );
      })}
    </AttributesContainer>
  );
};

export default AttributesDisplay;