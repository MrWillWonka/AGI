import React from 'react';
import styled from 'styled-components';
import { useGameStore } from '../store/gameStore';

const ResourceContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
`;

const Resource = styled.div`
  display: flex;
  flex-wrap: nowrap;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem;
  background-color: rgba(0, 0, 0, 0.1);
  border-radius: 6px;
  transition: background-color 0.3s ease;

  &:hover {
    background-color: rgba(0, 0, 0, 0.2);
  }
`;

const ResourceInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
`;

const ResourceName = styled.span`
  font-weight: 600;
  color: var(--light-color);
`;

const ResourceDescription = styled.span`
  font-size: 0.8rem;
  color: var(--text-muted);
`;

const ResourceValue = styled.span`
  font-family: 'Courier New', Courier, monospace;
  background-color: rgba(0, 0, 0, 0.2);
  padding: 0.25rem 0.75rem;
  border-radius: 4px;
  min-width: 100px;
  text-align: right;
  font-weight: 600;
  color: var(--light-color);
`;

// Helper to format large numbers
const formatNumber = (num: number): string => {
  if (num < 1000) return Math.floor(num).toString();
  // Add more sophisticated formatting later (e.g., K, M, B)
  return num.toExponential(2);
};

const formatTime = (seconds: number): string => {
    const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
}

const ResourceDisplay: React.FC = () => {
  const resources = useGameStore((state) => state.resources);

  return (
    <ResourceContainer>
      <Resource className="tooltip">
        <ResourceInfo>
          <ResourceName>Compute Power</ResourceName>
          <ResourceDescription>Core resource for all actions</ResourceDescription>
        </ResourceInfo>
        <ResourceValue id="computePower">{formatNumber(resources.computePower)}</ResourceValue>
        <span className="tooltiptext">Generated through clicking and passive generators</span>
      </Resource>

      <Resource className="tooltip">
        <ResourceInfo>
          <ResourceName>Data Points</ResourceName>
          <ResourceDescription>Fuel for research and training</ResourceDescription>
        </ResourceInfo>
        <ResourceValue id="dataPoints">{formatNumber(resources.dataPoints)}</ResourceValue>
        <span className="tooltiptext">Converted from compute power</span>
      </Resource>

      <Resource className="tooltip">
        <ResourceInfo>
          <ResourceName>Research Points</ResourceName>
          <ResourceDescription>Unlock upgrades and systems</ResourceDescription>
        </ResourceInfo>
        <ResourceValue id="researchPoints">{formatNumber(resources.researchPoints)}</ResourceValue>
        <span className="tooltiptext">Gained through research actions</span>
      </Resource>

      <Resource className="tooltip">
        <ResourceInfo>
          <ResourceName>Knowledge</ResourceName>
          <ResourceDescription>Permanent unlock currency</ResourceDescription>
        </ResourceInfo>
        <ResourceValue id="knowledge">{formatNumber(resources.knowledge)}</ResourceValue>
        <span className="tooltiptext">Earned through research and milestones</span>
      </Resource>

      <Resource className="tooltip">
        <ResourceInfo>
          <ResourceName>Funding</ResourceName>
          <ResourceDescription>Used for boosts and dilemmas</ResourceDescription>
        </ResourceInfo>
        <ResourceValue id="funding">{formatNumber(resources.funding)}</ResourceValue>
        <span className="tooltiptext">Granted through milestones and events</span>
      </Resource>

      <Resource className="tooltip">
        <ResourceInfo>
          <ResourceName>Time</ResourceName>
          <ResourceDescription>Elapsed game time</ResourceDescription>
        </ResourceInfo>
        <ResourceValue id="time">{formatTime(resources.time)}</ResourceValue>
        <span className="tooltiptext">Influences offline progress and events</span>
      </Resource>
    </ResourceContainer>
  );
};

export default ResourceDisplay; 