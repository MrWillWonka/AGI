import React, { useMemo } from 'react';
import styled from 'styled-components';
import { useGameStore, Generator as GeneratorType, Resources } from '../store/gameStore';
import { FaLock, FaBolt } from 'react-icons/fa'; // Keep FaLock and FaBolt (for production) for now
import { getIcon, IconConcept } from '../utils/getIcon'; // Import the utility

// Need to import or redefine IconWrapper if using it here
const IconWrapper = styled.span`
  display: inline-flex;
  align-items: center;
  margin-right: 0.3em; 
  color: var(--icon-color, inherit); 
`;

const Card = styled.div<{ $isUnlocked: boolean }>`
  background: var(--panel-bg);
  border-radius: 8px;
  border: 1px solid var(--panel-border);
  box-shadow: 0 2px 8px rgba(0,0,0,0.10);
  padding: 0.75rem 0.75rem 0.5rem 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  opacity: ${p => p.$isUnlocked ? 1 : 0.6}; // Slightly more visible when locked
  transition: box-shadow 0.2s, outline 0.2s, opacity 0.2s;
  min-width: 0;
  position: relative;
  min-height: 140px;
  &:hover {
    box-shadow: ${p => p.$isUnlocked ? '0 4px 16px rgba(0,0,0,0.16)' : '0 2px 8px rgba(0,0,0,0.10)'}; // No shadow change on hover if locked
    outline: ${p => p.$isUnlocked ? '2px solid var(--primary-color)' : 'none'}; // No outline on hover if locked
  }
`;

const TopRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const Name = styled.span`
  font-size: 0.98rem;
  font-weight: 600;
  color: var(--light-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const Owned = styled.span`
  font-size: 0.95rem;
  font-weight: bold;
  color: var(--secondary-color);
  margin-left: 0.5rem;
`;

const InfoRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.85rem;
  gap: 0.5rem;
`;

const InfoItem = styled.div`
  display: flex;
  align-items: center;
  gap: 0.25rem;
  color: var(--primary-color);
`;

const Description = styled.span`
  font-size: 0.75rem;
  color: var(--text-muted);
  margin-top: 0.1rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: help;
`;

const PurchaseButton = styled.button<{ $canAfford: boolean }>`
  margin-top: 0.4rem;
  width: 100%;
  padding: 0.35rem 0;
  font-size: 0.9rem;
  border-radius: 4px;
  border: none;
  background: ${p => p.$canAfford ? 'linear-gradient(90deg, var(--primary-color), var(--secondary-color))' : 'var(--panel-border)'};
  color: ${p => p.$canAfford ? 'white' : 'var(--text-muted)'};
  cursor: ${p => p.$canAfford ? 'pointer' : 'not-allowed'};
  font-weight: 500;
  transition: background 0.2s;
`;

// New component for displaying lock reason
const LockInfo = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  color: var(--text-muted);
  font-size: 0.85rem;
  padding: 1rem 0;
  gap: 0.4rem;
  height: 100%; // Take up space usually used by info/button
  margin-top: auto; // Push to bottom if needed, but centering is better
`;

const GeneratorComponent: React.FC<{ generator: GeneratorType }> = ({ generator }) => {
  const { purchaseGenerator, resources, getUnlockCondition } = useGameStore();

  const canAfford = useMemo(() => {
    const resourceAmount = resources[generator.resource] as number;
    return resourceAmount >= generator.cost;
  }, [resources, generator.cost, generator.resource]);

  const unlockCondition = useMemo(() => {
      if (generator.isUnlocked) return true;
      return getUnlockCondition(generator.id);
  }, [generator.isUnlocked, generator.id, getUnlockCondition]);

  return (
    <Card $isUnlocked={generator.isUnlocked} title={generator.description}>
      <TopRow>
        <Name>{generator.name}</Name>
        {generator.isUnlocked && <Owned>x{generator.owned}</Owned>}
      </TopRow>

      {generator.isUnlocked ? (
        <>
          <InfoRow>
            <InfoItem>
              {getIcon(generator.resource as IconConcept)}
              <span>Cost: {generator.cost}</span>
            </InfoItem>
            <InfoItem>
              {getIcon(generator.resource as IconConcept)}
              <span>{generator.production}/s</span>
            </InfoItem>
          </InfoRow>
          <Description title={generator.description}>{generator.description}</Description>
          <PurchaseButton 
            onClick={() => purchaseGenerator(generator.id)}
            disabled={!canAfford}
            $canAfford={canAfford}
          >
            Purchase
          </PurchaseButton>
        </>
      ) : (
        <>
          <Description title={generator.description}>{generator.description}</Description>
          <LockInfo>
            <FaLock size="1.2em" /> 
            <span>{typeof unlockCondition === 'string' ? unlockCondition : 'Locked'}</span>
          </LockInfo>
        </>
      )}
    </Card>
  );
};

export default React.memo(GeneratorComponent);