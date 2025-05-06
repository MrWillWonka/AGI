import React from 'react';
import styled from 'styled-components';
// We might need useGameStore later to get the actual phase
// import { useGameStore } from '../store/gameStore'; 

// Main container for the phase info
const PhaseContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.6rem; // Slightly increased gap for progress bar
`;

// Combined Phase Title
const PhaseTitle = styled.div`
  font-size: 1.0rem; // Adjusted size
  font-weight: 500;
  color: var(--light-color);
  text-align: left;

  span {
    font-weight: 600;
    color: var(--primary-color);
    margin-left: 0.3em;
  }
`;

// Re-add Progress Bar components (simplified styling)
const ProgressContainer = styled.div`
  width: 100%;
  height: 10px; // Make slightly taller for text visibility
  background-color: rgba(0, 0, 0, 0.2);
  border-radius: 5px; // Match height
  overflow: hidden;
  position: relative; // Needed for absolute positioning of label
`;

const ProgressBar = styled.div<{ $progress: number }>`
  height: 100%;
  background: linear-gradient(90deg, var(--primary-color) 0%, var(--secondary-color) 100%);
  border-radius: 5px; // Match container
  transition: width 0.3s ease;
  width: ${props => props.$progress}%;
`;

// New component for the percentage text label
const ProgressBarLabel = styled.span`
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  font-size: 0.75rem; // Small text
  font-weight: 500;
  color: #fff; // White text for contrast
  text-shadow: 1px 1px 1px rgba(0, 0, 0, 0.6); // Shadow for readability
  pointer-events: none; // Prevent interfering with tooltip
`;

const PhaseDisplay: React.FC = () => {
  // Placeholder - replace with actual logic from game state later
  const currentPhase = "Narrow AI";
  const currentProgressPercent = 35; // Example progress

  return (
    <PhaseContainer>
      <PhaseTitle>
        Current Phase:
        <span>{currentPhase}</span>
      </PhaseTitle>
      <ProgressContainer title={`${currentProgressPercent}% Progress`}>
        <ProgressBar $progress={currentProgressPercent} />
        <ProgressBarLabel>{currentProgressPercent}%</ProgressBarLabel>
      </ProgressContainer>
      {/* Tooltip could be added back to PhaseContainer if needed */}
    </PhaseContainer>
  );
};

export default PhaseDisplay; 