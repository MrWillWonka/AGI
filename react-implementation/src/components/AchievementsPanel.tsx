import React from 'react';
import styled from 'styled-components';

const AchievementsContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const Achievement = styled.div<{ $unlocked: boolean }>`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background-color: ${props => props.$unlocked ? 'rgba(56, 176, 0, 0.1)' : 'rgba(0, 0, 0, 0.1)'};
  border-radius: 8px;
  transition: all 0.3s ease;

  &:hover {
    background-color: ${props => props.$unlocked ? 'rgba(56, 176, 0, 0.2)' : 'rgba(0, 0, 0, 0.2)'};
  }
`;

const AchievementIcon = styled.div<{ $unlocked: boolean }>`
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background-color: ${props => props.$unlocked ? 'var(--success-color)' : '#333340'};
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${props => props.$unlocked ? 'var(--dark-color)' : 'var(--light-color)'};
  font-weight: bold;
  font-size: 18px;
`;

const AchievementInfo = styled.div`
  flex: 1;
`;

const AchievementName = styled.div`
  font-weight: 600;
  color: var(--light-color);
  margin-bottom: 4px;
`;

const AchievementDescription = styled.div`
  font-size: 0.9em;
  color: var(--secondary-color);
`;

const AchievementsPanel: React.FC = () => {
  return (
    <AchievementsContainer>
      <Achievement $unlocked={true}>
        <AchievementIcon $unlocked={true}>✓</AchievementIcon>
        <AchievementInfo>
          <AchievementName>First Steps</AchievementName>
          <AchievementDescription>Begin your AI training journey</AchievementDescription>
        </AchievementInfo>
      </Achievement>
      <Achievement $unlocked={false}>
        <AchievementIcon $unlocked={false}>?</AchievementIcon>
        <AchievementInfo>
          <AchievementName>Data Master</AchievementName>
          <AchievementDescription>Collect 1000 data points</AchievementDescription>
        </AchievementInfo>
      </Achievement>
      <Achievement $unlocked={false}>
        <AchievementIcon $unlocked={false}>?</AchievementIcon>
        <AchievementInfo>
          <AchievementName>Pattern Recognition</AchievementName>
          <AchievementDescription>Reach 50% accuracy in pattern recognition</AchievementDescription>
        </AchievementInfo>
      </Achievement>
    </AchievementsContainer>
  );
};

export default AchievementsPanel; 