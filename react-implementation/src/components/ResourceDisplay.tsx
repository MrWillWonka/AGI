import React, { useMemo } from 'react';
import styled from 'styled-components';
import { useGameStore, Resources } from '../store/gameStore';
import { getIcon, IconConcept } from '../utils/getIcon';
import { formatNumber } from '../utils/formatNumber';
import { formatTime } from '../utils/formatTime';

const ResourceList = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0;
`;

const ResourceItem = styled.li`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 0.6rem 0;
  border-bottom: 1px solid var(--panel-border-light);
  font-size: 0.95rem;

  &:last-child {
    border-bottom: none;
  }
`;

const ResourceName = styled.span`
  display: flex;
  align-items: center;
  color: var(--light-color);
  line-height: 1.2;
`;

// New container for the right side (amount + rate)
const ValueContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-end;
`;

const ResourceValue = styled.span`
  font-weight: bold;
  color: var(--primary-color);
  line-height: 1.2;
`;

const ProductionRate = styled.span`
  font-size: 0.8rem;
  color: var(--secondary-color);
  opacity: 0.8;
  line-height: 1;
`;

// Helper to format resource names (can be moved to utils)
const formatResourceName = (key: string): string => {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
}

const ResourceDisplay: React.FC = () => {
  const resources = useGameStore((state) => state.resources);
  const generators = useGameStore((state) => state.generators);
  const efficiency = useGameStore((state) => state.attributes.efficiency);

  // Calculate total production per second for relevant resources
  const productionRates = useMemo(() => {
    const rates: Partial<Record<keyof Resources, number>> = {};
    generators.forEach(gen => {
      if (gen.isUnlocked && gen.owned > 0) {
        const rate = gen.production * gen.owned * efficiency;
        rates[gen.resource] = (rates[gen.resource] || 0) + rate;
      }
    });
    return rates;
  }, [generators, efficiency]);

  // Get all resources
  const allResources = Object.entries(resources);

  return (
    <ResourceList>
      {allResources.map(([key, value]) => {
        // Hide Funding if its value is 0
        if (key === 'funding' && value === 0) {
          return null;
        }

        const production = productionRates[key as keyof Resources] || 0;
        const isTime = key === 'time';

        return (
          <ResourceItem key={key}>
            <ResourceName>
              {getIcon(key as IconConcept)}
              {formatResourceName(key)}
            </ResourceName>
            <ValueContainer>
              <ResourceValue>{isTime ? formatTime(value) : formatNumber(value)}</ResourceValue>
              {production > 0 && !isTime && (
                <ProductionRate>
                  (+{formatNumber(production)}/s)
                </ProductionRate>
              )}
            </ValueContainer>
          </ResourceItem>
        );
      })}
    </ResourceList>
  );
};

export default ResourceDisplay; 