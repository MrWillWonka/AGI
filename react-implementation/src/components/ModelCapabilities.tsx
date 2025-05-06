import React from 'react';
import styled from 'styled-components';

const Resource = styled.div`
  display: flex;
  flex-wrap: nowrap;
  justify-content: space-between;
  align-items: center;
  margin: 8px 0;
  padding: 8px;
  background-color: rgba(0,0,0,0.1);
  border-radius: 6px;
  transition: background-color 0.3s ease;

  &:hover {
    background-color: rgba(0,0,0,0.2);
  }
`;

const ResourceName = styled.span`
  font-weight: 600;
  color: var(--light-color);
`;

const ProgressContainer = styled.div`
  width: 100%;
  height: 24px;
  background-color: #333340;
  border-radius: 12px;
  margin: 10px 0;
  overflow: hidden;
  box-shadow: inset 0 2px 4px rgba(0,0,0,0.2);
`;

const ProgressBar = styled.div<{ $progress: number }>`
  height: 100%;
  background: linear-gradient(90deg, var(--success-color) 0%, #2d8c00 100%);
  border-radius: 12px;
  transition: width 0.3s ease;
  width: ${props => props.$progress}%;
  box-shadow: 0 2px 4px rgba(56, 176, 0, 0.3);
`;

const ResourceValue = styled.span`
  font-family: 'Courier New', Courier, monospace;
  background-color: rgba(0,0,0,0.2);
  padding: 4px 10px;
  border-radius: 6px;
  min-width: 100px;
  text-align: right;
  font-weight: 600;
  color: var(--light-color);
`;

const ModelCapabilities: React.FC = () => {
  return (
    <div>
      <Resource>
        <ResourceName>Text Processing:</ResourceName>
        <ProgressContainer>
          <ProgressBar $progress={25} id="textProcessingBar" />
        </ProgressContainer>
        <ResourceValue id="textProcessing">25</ResourceValue>
      </Resource>
      <Resource>
        <ResourceName>Image Recognition:</ResourceName>
        <ProgressContainer>
          <ProgressBar $progress={15} id="imageRecognitionBar" />
        </ProgressContainer>
        <ResourceValue id="imageRecognition">15</ResourceValue>
      </Resource>
      <Resource>
        <ResourceName>Audio Processing:</ResourceName>
        <ProgressContainer>
          <ProgressBar $progress={10} id="audioProcessingBar" />
        </ProgressContainer>
        <ResourceValue id="audioProcessing">10</ResourceValue>
      </Resource>
      <Resource>
        <ResourceName>Video Analysis:</ResourceName>
        <ProgressContainer>
          <ProgressBar $progress={5} id="videoAnalysisBar" />
        </ProgressContainer>
        <ResourceValue id="videoAnalysis">5</ResourceValue>
      </Resource>
      <Resource>
        <ResourceName>Structured Data Analysis:</ResourceName>
        <ProgressContainer>
          <ProgressBar $progress={20} id="structuredDataAnalysisBar" />
        </ProgressContainer>
        <ResourceValue id="structuredDataAnalysis">20</ResourceValue>
      </Resource>
    </div>
  );
};

export default ModelCapabilities; 