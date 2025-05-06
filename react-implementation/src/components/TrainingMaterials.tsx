import React from 'react';
import styled from 'styled-components';

const TrainingMaterialsContainer = styled.div`
  margin-bottom: 20px;
`;

const MilestonesSection = styled.div`
  margin-top: 20px;
`;

const Milestone = styled.div<{ $achieved?: boolean }>`
  background-color: #3a3a45;
  border-radius: 5px;
  padding: 10px;
  margin: 10px 0;
  border-left: 4px solid ${props => props.$achieved ? 'var(--success-color)' : 'var(--warning-color)'};
  opacity: ${props => props.$achieved ? 1 : 0.6};
  transition: all 0.3s ease;
`;

const TrainingMaterials: React.FC = () => {
  return (
    <TrainingMaterialsContainer>
      <div id="trainingMaterialsList">
        {/* Training materials will be added here */}
      </div>
      
      <MilestonesSection id="phaseMilestones" className="tooltip">
        <h3>Milestones</h3>
        <span className="tooltiptext">
          Key achievements that unlock new capabilities. 
          Complete these to expand your AI's potential and access new features.
        </span>
        <div id="milestonesList">
          <Milestone>
            <h4>Basic Training</h4>
            <p>Train your AI on basic datasets</p>
          </Milestone>
          <Milestone $achieved={true}>
            <h4>Data Collection</h4>
            <p>Establish automated data collection</p>
          </Milestone>
          <Milestone>
            <h4>Advanced Learning</h4>
            <p>Implement deep learning algorithms</p>
          </Milestone>
        </div>
      </MilestonesSection>
    </TrainingMaterialsContainer>
  );
};

export default TrainingMaterials; 