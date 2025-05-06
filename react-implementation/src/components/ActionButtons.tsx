import React from 'react';
import styled from 'styled-components';
import { useGameStore } from '../store/gameStore';
import { getIcon, IconConcept } from '../utils/getIcon';

const ActionsContainer = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 0.75rem;
  margin-top: 1rem;
`;

const ActionButton = styled.button<{ disabled?: boolean }>`
  background: ${props => props.disabled ? 'var(--panel-border)' : 'linear-gradient(90deg, var(--primary-color), var(--secondary-color))'};
  color: ${props => props.disabled ? 'var(--text-muted)' : 'white'};
  border: none;
  padding: 0.35rem 0.5rem;
  border-radius: 4px;
  cursor: ${props => props.disabled ? 'not-allowed' : 'pointer'};
  font-size: 0.9rem;
  transition: background 0.2s;
  width: 100%;
  font-weight: 500;
  text-transform: none;
  letter-spacing: normal;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.1rem;
  opacity: 1;
  pointer-events: ${props => props.disabled ? 'none' : 'auto'};
  position: relative;
  min-height: auto;

  &:hover:not(:disabled) {
    filter: brightness(1.1);
    transform: none;
    box-shadow: none;
  }

  &:active:not(:disabled) {
    filter: brightness(0.95);
    transform: none;
  }

  &:disabled {
    cursor: not-allowed;
    transform: none;
    box-shadow: none;
    filter: none;
  }
`;

const ActionName = styled.span`
  font-weight: 500;
  font-size: 0.9rem;
  white-space: nowrap;
`;

const ActionCost = styled.span`
  font-size: 0.85rem;
  color: inherit;
  opacity: 0.8;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  ${ActionButton}:disabled & {
      opacity: 0.6;
  }
`;

const ActionDescription = styled.span`
  font-size: 0.85rem;
  color: var(--text-muted);
`;

const ActionInfoRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
`;

const TooltipText = styled.span`
  visibility: hidden;
  width: 200px;
  background-color: var(--dark-color);
  color: var(--light-color);
  text-align: center;
  border-radius: 6px;
  padding: 10px;
  position: absolute;
  z-index: 1;
  bottom: 110%;
  left: 50%;
  margin-left: -100px;
  opacity: 0;
  transition: opacity 0.3s;
  border: 1px solid var(--primary-color);
  pointer-events: none;

  ${ActionButton}:hover & {
    visibility: visible;
    opacity: 1;
  }
`;

const ActionButtons: React.FC = () => {
  const computePower = useGameStore((state) => state.resources.computePower);
  const dataPoints = useGameStore((state) => state.resources.dataPoints);
  const researchPoints = useGameStore((state) => state.resources.researchPoints);
  const collectData = useGameStore((state) => state.collectData);
  const trainModel = useGameStore((state) => state.trainModel);
  const research = useGameStore((state) => state.research);
  const selfImprove = useGameStore((state) => state.selfImprove);
  const generateCompute = useGameStore((state) => state.generateCompute);
  
  const costs = {
    collectData: 10, 
    trainModel: 50, 
    research: 100, 
    selfImprove: 50, 
    prestige: 1000, 
    newModel: 5000, 
  };

  return (
    <ActionsContainer>
      <ActionButton
        onClick={() => generateCompute(1)}
      >
        <ActionInfoRow>
          <ActionName>Generate Compute</ActionName>
        </ActionInfoRow>
        <TooltipText>Manually generate compute power. The core active generation method.</TooltipText>
      </ActionButton>

      <ActionButton
        onClick={collectData}
        disabled={computePower < costs.collectData} 
      >
        <ActionInfoRow>
          <ActionName>Collect Data</ActionName>
          <ActionCost>{getIcon('computePower')} {costs.collectData}</ActionCost>
        </ActionInfoRow>
        <TooltipText>Cost: {costs.collectData} Compute. Convert compute to data. Efficiency affects conversion rate.</TooltipText>
      </ActionButton>

      <ActionButton
        onClick={trainModel}
        disabled={dataPoints < costs.trainModel}
      >
        <ActionInfoRow>
          <ActionName>Train Model</ActionName>
          <ActionCost>{getIcon('dataPoints')} {costs.trainModel}</ActionCost>
        </ActionInfoRow>
        <TooltipText>Cost: {costs.trainModel} Data. Increase intelligence. Training speed affected by efficiency.</TooltipText>
      </ActionButton>

      <ActionButton
        onClick={research}
        disabled={dataPoints < costs.research}
      >
        <ActionInfoRow>
          <ActionName>Research</ActionName>
          <ActionCost>{getIcon('dataPoints')} {costs.research}</ActionCost>
        </ActionInfoRow>
        <TooltipText>Cost: {costs.research} Data. Gain research points. Creativity affects research quality.</TooltipText>
      </ActionButton>

      <ActionButton
        onClick={selfImprove}
        disabled={researchPoints < costs.selfImprove}
      >
        <ActionInfoRow>
          <ActionName>Self Improve</ActionName>
          <ActionCost>{getIcon('researchPoints')} {costs.selfImprove}</ActionCost>
        </ActionInfoRow>
        <TooltipText>Cost: {costs.selfImprove} Research. Improve efficiency. Requires high awareness and intelligence.</TooltipText>
      </ActionButton>

      <ActionButton disabled={dataPoints < costs.prestige}>
        <ActionInfoRow>
          <ActionName>Prestige</ActionName>
          <ActionCost>{getIcon('dataPoints')} {costs.prestige}</ActionCost>
        </ActionInfoRow>
        <TooltipText>Cost: {costs.prestige} Data. Reset with prestige points. Available after 30-45 minutes.</TooltipText>
      </ActionButton>

      <ActionButton disabled={dataPoints < costs.newModel}>
        <ActionInfoRow>
          <ActionName>New Model</ActionName>
          <ActionCost>{getIcon('dataPoints')} {costs.newModel}</ActionCost>
        </ActionInfoRow>
        <TooltipText>Cost: {costs.newModel} Data. Deep reset with fragments. Available after 3-5 hours.</TooltipText>
      </ActionButton>
    </ActionsContainer>
  );
};

export default ActionButtons; 