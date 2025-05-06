import React from 'react';
import styled from 'styled-components';

const PhaseInfo = styled.div`
  margin: 15px 0;
  width: 95%;
  align-items: center;
`;

const PhaseName = styled.div`
  font-size: 1.5em;
  font-weight: bold;
  text-align: center;
  color: var(--primary-color);
  width: 100%;
`;

const PhaseProgress = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`;

const ProgressContainer = styled.div`
  width: 100%;
  align-self: center;
`;

const ProgressBar = styled.div<{ $progress: number }>`
  height: 100%;
  background: linear-gradient(90deg, var(--success-color) 0%, #2d8c00 100%);
  border-radius: 12px;
  transition: width 0.3s ease;
  width: ${props => props.$progress}%;
  box-shadow: 0 2px 4px rgba(56, 176, 0, 0.3);
`;

const ProgressText = styled.div`
  width: 100%;
  min-width: 10px;
  text-align: left;
  font-family: 'Courier New', Courier, monospace;
`;

const PhaseDisplay: React.FC = () => {
  const currentProgressValue = 0;

  return (
    <PhaseInfo className="phase-info tooltip">
      <PhaseName id="currentPhase">Narrow AI</PhaseName>
      <span className="tooltiptext">
        Your AI system evolves through phases as you develop its capabilities. 
        Progress is based on Intelligence, Awareness, and Creativity attributes.
      </span>
      <PhaseProgress>
        <ProgressContainer className="progress-container tooltip" id="phaseProgressContainer">
          <ProgressBar $progress={currentProgressValue} id="phaseProgressBar" />
          <span className="tooltiptext">
            Phase progress increases as you develop attributes. 
            To advance phases: Intelligence contributes 2%, Awareness 3%, and Creativity 2% per point.
          </span>
        </ProgressContainer>
        <ProgressText id="phaseProgressText">{currentProgressValue}%</ProgressText>
      </PhaseProgress>
    </PhaseInfo>
  );
};

export default PhaseDisplay; 