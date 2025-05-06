import React from 'react';
import styled from 'styled-components';
import {
  FaCogs, FaCoins, FaBolt, FaBrain, FaPaintBrush,
  FaEye, FaTachometerAlt, FaBook, FaDollarSign, FaClock
} from 'react-icons/fa';

// Consistent wrapper for icons
const IconWrapper = styled.span`
  display: inline-flex;
  align-items: center;
  margin-right: 0.3em; // Consistent spacing
  color: var(--icon-color, inherit); // Allow overriding color
`;

export type IconConcept =
  | 'computePower' | 'dataPoints' | 'researchPoints'
  | 'intelligence' | 'creativity' | 'awareness' | 'efficiency'
  | 'knowledge' | 'funding' | 'time';

export const getIcon = (concept: IconConcept, title?: string): React.ReactNode => {
  const iconProps = { title: title || concept }; // Default title

  switch (concept) {
    case 'computePower': return <IconWrapper><FaCogs {...iconProps} /></IconWrapper>;
    case 'dataPoints': return <IconWrapper><FaCoins {...iconProps} /></IconWrapper>;
    case 'researchPoints': return <IconWrapper><FaBolt {...iconProps} /></IconWrapper>;
    case 'intelligence': return <IconWrapper><FaBrain {...iconProps} /></IconWrapper>;
    case 'creativity': return <IconWrapper><FaPaintBrush {...iconProps} /></IconWrapper>;
    case 'awareness': return <IconWrapper><FaEye {...iconProps} /></IconWrapper>;
    case 'efficiency': return <IconWrapper><FaTachometerAlt {...iconProps} /></IconWrapper>;
    case 'knowledge': return <IconWrapper><FaBook {...iconProps} /></IconWrapper>;
    case 'funding': return <IconWrapper><FaDollarSign {...iconProps} /></IconWrapper>;
    case 'time': return <IconWrapper><FaClock {...iconProps} /></IconWrapper>;
    default: return null;
  }
}; 