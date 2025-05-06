import React from 'react';
import styled from 'styled-components';
import { useGameStore } from '../store/gameStore';

const ActionsContainer = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
  margin-top: 1rem;
`;

const ActionButton = styled.button<{ disabled?: boolean }>`
  background: linear-gradient(135deg, var(--primary-color) 0%, #2d63c4 100%);
  color: white;
  border: none;
  padding: 1rem;
  border-radius: 8px;
  cursor: pointer;
  font-size: 1rem;
  transition: all 0.3s ease;
  width: 100%;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  opacity: ${props => props.disabled ? 0.5 : 1};
  pointer-events: ${props => props.disabled ? 'none' : 'auto'};
  position: relative;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(58, 134, 255, 0.3);
  }

  &:active {
    transform: translateY(0);
  }

  &:disabled {
    background: linear-gradient(135deg, #6c757d 0%, #495057 100%);
    cursor: not-allowed;
    transform: none;
    box-shadow: none;
  }
`;

const ActionName = styled.span`
  font-size: 1.1rem;
`;

const ActionCost = styled.span`
  font-size: 0.9rem;
  opacity: 0.8;
  font-family: 'Courier New', Courier, monospace;
`;

const ActionDescription = styled.span`
  font-size: 0.8rem;
  text-align: center;
  color: rgba(255, 255, 255, 0.8);
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
        onClick={collectData}
        disabled={computePower < costs.collectData} 
      >
        <ActionName>Collect Data</ActionName>
        <ActionCost>Cost: {costs.collectData} Compute</ActionCost>
        <ActionDescription>Convert compute to data</ActionDescription>
        <TooltipText>Efficiency affects conversion rate</TooltipText>
      </ActionButton>

      <ActionButton
        onClick={trainModel}
        disabled={dataPoints < costs.trainModel}
      >
        <ActionName>Train Model</ActionName>
        <ActionCost>Cost: {costs.trainModel} Data</ActionCost>
        <ActionDescription>Increase intelligence</ActionDescription>
        <TooltipText>Training speed affected by efficiency</TooltipText>
      </ActionButton>

      <ActionButton
        onClick={research}
        disabled={dataPoints < costs.research}
      >
        <ActionName>Research</ActionName>
        <ActionCost>Cost: {costs.research} Data</ActionCost>
        <ActionDescription>Gain research points</ActionDescription>
        <TooltipText>Creativity affects research quality</TooltipText>
      </ActionButton>

      <ActionButton
        onClick={selfImprove}
        disabled={researchPoints < costs.selfImprove}
      >
        <ActionName>Self Improve</ActionName>
        <ActionCost>Cost: {costs.selfImprove} Research</ActionCost>
        <ActionDescription>Improve efficiency</ActionDescription>
        <TooltipText>Requires high awareness and intelligence (Placeholder)</TooltipText>
      </ActionButton>

      <ActionButton disabled={dataPoints < costs.prestige}>
        <ActionName>Prestige</ActionName>
        <ActionCost>Cost: {costs.prestige} Data</ActionCost>
        <ActionDescription>Reset with prestige points</ActionDescription>
        <TooltipText>Available after 30-45 minutes (Placeholder)</TooltipText>
      </ActionButton>

      <ActionButton disabled={dataPoints < costs.newModel}>
        <ActionName>New Model</ActionName>
        <ActionCost>Cost: {costs.newModel} Data</ActionCost>
        <ActionDescription>Deep reset with fragments</ActionDescription>
        <TooltipText>Available after 3-5 hours (Placeholder)</TooltipText>
      </ActionButton>
    </ActionsContainer>
  );
};

export default ActionButtons; 