import React, { useMemo } from 'react';
import styled from 'styled-components';
import { useGameStore, Resources, GameState } from '../store/gameStore';
import { getIcon, IconConcept } from '../utils/getIcon';
import { formatNumber } from '../utils/formatNumber';
import { formatTime } from '../utils/formatTime';

// Main container for header display
const HeaderResourceContainer = styled.div`
  display: flex;
  flex-wrap: nowrap;
  gap: 1rem;
  align-items: center;
  justify-content: flex-start;
  justify-self: start;
`;

// Individual resource item for header
const HeaderResourceItem = styled.div`
  display: flex;
  align-items: center;
  gap: 0.4em;
  color: var(--light-color);
`;

// Add back a simple name component if needed, or just use icon + value
const HeaderResourceName = styled.span`
  font-weight: 500;
  font-size: 0.9rem;
  color: var(--light-color);
`;

// Styling for the value part (including rate)
const HeaderResourceValue = styled.span`
  font-weight: 600; // Make value slightly bolder
  font-size: 0.95rem;
  color: var(--primary-color);
  display: inline-flex;
  align-items: baseline;
  gap: 0.3em;
`;

const HeaderProductionRate = styled.span`
  font-size: 0.75rem;
  color: var(--secondary-color);
  opacity: 0.8;
`;

// Re-add formatResourceName helper if it was removed
const formatResourceName = (key: string): string => {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
}

// Component Props
interface ResourceDisplayProps {
  tickRateMs: number;
}

const ResourceDisplay: React.FC<ResourceDisplayProps> = ({ tickRateMs }) => {
  // Select the entire state object
  const fullState = useGameStore();

  // Use useMemo to extract and memoize the needed slice
  const { resources, generators, efficiency } = useMemo(() => ({
    resources: fullState.resources,
    generators: fullState.generators,
    efficiency: fullState.attributes.efficiency
  }), [
    fullState.resources,
    fullState.generators,
    fullState.attributes.efficiency
  ]);

  // Calculate production rates directly
  const productionRates = generators.reduce((rates: Partial<Record<keyof Resources, number>>, gen) => {
    if (gen.isUnlocked && gen.owned > 0) {
      const rate = gen.production * gen.owned * efficiency;
      const resourceKey = gen.resource;
      rates[resourceKey] = (rates[resourceKey] || 0) + rate;
    }
    return rates;
  }, {});

  // Use resources directly for mapping/rendering values
  const allResources = Object.entries(resources);

  return (
    <HeaderResourceContainer>
      {allResources.filter(([key]) => key !== 'time').map(([key, value]) => {
        if (key === 'funding' && (value as number) === 0) { 
          return null;
        }

        const production = productionRates[key as keyof Resources] || 0;
        const isTime = key === 'time';
        const name = formatResourceName(key);
        const iconTitle = name;

        return (
          <HeaderResourceItem key={key} title={iconTitle}>
            {getIcon(key as IconConcept, ' ')} 
            <HeaderResourceName>{name}:</HeaderResourceName>
            <HeaderResourceValue>
              {isTime ? formatTime(value as number) : formatNumber(value as number)}
              {production > 0 && !isTime && (
                <HeaderProductionRate>
                  (+{formatNumber(production)}/s)
                </HeaderProductionRate>
              )}
            </HeaderResourceValue>
          </HeaderResourceItem>
        );
      })}
    </HeaderResourceContainer>
  );
};

export default ResourceDisplay; 