import React, { useMemo } from 'react';
import styled from 'styled-components';
import { useGameStore, Generator as GeneratorType } from '../store/gameStore';

// --- Styled Components ---
const GeneratorContainer = styled.div<{ $isUnlocked: boolean; $canAfford: boolean }>`
  background-color: var(--panel-bg);
  border-radius: 8px;
  padding: 1rem;
  margin-bottom: 1rem;
  border-left: 4px solid ${props => props.$isUnlocked ? 'var(--secondary-color)' : '#555'};
  opacity: ${props => props.$isUnlocked ? 1 : 0.6};
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0.5rem 1rem;
  align-items: center;
  transition: all 0.3s ease;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);

  &:hover {
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
    transform: ${props => props.$isUnlocked ? 'translateX(3px)' : 'none'};
  }
`;

const InfoColumn = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
`;

const ActionColumn = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.5rem;
`;

const GeneratorName = styled.h4`
  margin: 0;
  font-size: 1.1rem;
  color: var(--light-color);
`;

const GeneratorDescription = styled.p`
  margin: 0;
  font-size: 0.85rem;
  color: var(--text-muted);
`;

const GeneratorStats = styled.div`
  font-size: 0.9rem;
  color: var(--primary-color);
  font-family: 'Courier New', Courier, monospace;
`;

const OwnedCount = styled.span`
  font-weight: bold;
  font-size: 1.2rem;
  color: var(--light-color);
  text-align: right;
`;

const BuyButton = styled.button`
  background: linear-gradient(135deg, var(--secondary-color) 0%, var(--tertiary-color) 100%);
  color: white;
  border: none;
  padding: 0.6rem 1rem;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 600;
  transition: all 0.2s ease;
  white-space: nowrap;

  &:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
  }

  &:disabled {
    background: linear-gradient(135deg, #6c757d 0%, #495057 100%);
    cursor: not-allowed;
    opacity: 0.6;
  }
`;

// --- Helper Functions ---
const formatNumber = (num: number): string => {
  if (num < 1000) return num.toFixed(1);
  if (num < 1e6) return (num / 1e3).toFixed(1) + 'K';
  if (num < 1e9) return (num / 1e6).toFixed(1) + 'M';
  // Add more suffixes as needed
  return num.toExponential(1);
};

const formatResourceName = (key: string): string => {
    // Simple formatter, can be expanded
    return key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
}

// --- Component Implementation ---
const GeneratorComponentImpl: React.FC<{ generator: GeneratorType }> = ({ generator }) => {
  // Select only the specific state values needed + the action
  const costResourceValue = useGameStore(state => state.resources[generator.costResource]);
  const efficiency = useGameStore(state => state.attributes.efficiency);
  const buyGenerator = useGameStore(state => state.buyGenerator);

  const isUnlocked = generator.isUnlocked; 

  // Memoize derived values with granular dependencies
  const { canAfford, productionPerSecond, productionPerUnit } = useMemo(() => {
    const canAfford = isUnlocked && costResourceValue >= generator.currentCost;
    const productionPerUnit = generator.baseProduction * efficiency;
    const productionPerSecond = productionPerUnit * generator.owned;
    return { canAfford, productionPerSecond, productionPerUnit };
  }, [
    // Depend on specific primitive values and prop values
    isUnlocked, 
    costResourceValue, // The specific resource value used for cost check
    efficiency,      // The specific attribute value used for production
    generator.currentCost, 
    generator.baseProduction, 
    generator.owned
    // generator.costResource is implicitly handled by costResourceValue dependency
  ]);

  // console.log(`Rendering Generator: ${generator.name}, Unlocked: ${isUnlocked}, Owned: ${generator.owned}`); // Debug log

  return (
    <GeneratorContainer $isUnlocked={isUnlocked} $canAfford={canAfford}>
      <InfoColumn>
        <GeneratorName>{generator.name}</GeneratorName>
        <GeneratorDescription>{generator.description}</GeneratorDescription>
        <GeneratorStats>
          {/* Use memoized productionPerUnit */}
          Produces: {formatNumber(productionPerUnit)} {formatResourceName(generator.resource)}/s/unit 
          <br />
          {/* Use memoized productionPerSecond */}
          Total: {formatNumber(productionPerSecond)}/s
        </GeneratorStats>
      </InfoColumn>

      <ActionColumn>
        <OwnedCount>{generator.owned}</OwnedCount>
        <BuyButton
          onClick={() => buyGenerator(generator.id)}
          // Disable based on memoized canAfford and isUnlocked
          disabled={!canAfford}
          title={`Cost: ${formatNumber(generator.currentCost)} ${formatResourceName(generator.costResource)}`}
        >
          Buy {formatNumber(generator.currentCost)} {formatResourceName(generator.costResource)}
        </BuyButton>
        {/* Show locked status based on the prop */}
        {!isUnlocked && <span style={{fontSize: '0.8rem', color: 'var(--warning-color)'}}>Locked</span>}
      </ActionColumn>
    </GeneratorContainer>
  );
};

// Wrap the component with React.memo
const GeneratorComponent = React.memo(GeneratorComponentImpl);

export default GeneratorComponent; 