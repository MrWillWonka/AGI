/**
 * Enhanced Progressive UI Effects
 * Dramatically enhances the AGI game with advanced visual effects that evolve as the player advances
 */

// Create namespace to avoid conflicts
window.AGIUI = (function() {
    // Track current phase to avoid unnecessary updates
    let currentPhase = 'narrow-ai';

    // Track intensity level for effects (0-1)
    let effectsIntensity = 0;

    // Track active particles for performance management
    let activeParticles = 0;
    const MAX_PARTICLES = 300;

    // DOM element references for advanced effects
    let ambientBackgroundCanvas = null;
    let ambientBackgroundCtx = null;
    let energyGridCanvas = null;
    let energyGridCtx = null;
    let digitalRainCanvas = null;
    let digitalRainCtx = null;
    let floatingOrbsContainer = null;
    let lightningCanvas = null;
    let lightningCtx = null;

    // Digital Rain specific variables
    let digitalRainColumns = 0;
    let digitalRainDrops = [];
    let digitalRainActive = false;

    // Floating Orbs specific variables
    let floatingOrbs = [];
    let floatingOrbsActive = false;

    // Energy Grid specific variables
    let energyGridNodes = [];
    let energyGridActive = false;

    // Lightning specific variables
    let lightningActive = false;
    
    // Initialize UI enhancements
    function init() {
        console.log("Enhanced Progressive UI initialized");
        
        // Apply initial phase class to body
        updatePhaseClass('narrow-ai');
        
        // Set up mutation observer to watch for game state changes
        setupStateObserver();
        
        // Add particle effects
        setupParticleEffects();
        
        // Fix tooltip positions
        fixTooltipPositions();
        
        // Initialize element animations
        initAnimations();

        // Initialize advanced effects (canvases, containers)
        initAdvancedEffects();

        // Create ambient background effects
        createAmbientBackground();

        // Create energy grid
        createEnergyGrid();

        // Setup digital rain effect for later phases
        setupDigitalRain();

        // Add lightning effect
        setupLightningEffect();

        // Setup floating orbs
        setupFloatingOrbs();

        // Add pulse effects to important elements
        addPulseEffects();

        // Add audio feedback (optional - commented out by default)
        // setupAudioFeedback();

        // Start the main animation loop
        requestAnimationFrame(animationLoop);
    }
    
    // Update body class based on current phase
    function updatePhaseClass(phase) {
        if (phase === currentPhase) return;
        
        // Remove old phase class
        document.body.classList.remove(`phase-${currentPhase}`);
        
        // Add new phase class
        document.body.classList.add(`phase-${phase}`);
        
        // Update tracking
        currentPhase = phase;
        
        // Trigger transition effect
        document.body.classList.add('phase-transition');
        setTimeout(() => {
            document.body.classList.remove('phase-transition');
        }, 3000); // Match CSS animation duration

        // Update color scheme
        updateColorScheme(phase);

        // Trigger a special phase transition effect
        triggerPhaseTransitionEffect(phase);
        
        console.log(`UI Phase updated to: ${phase}`);
    }

    // Update CSS variables for color scheme based on phase
    function updateColorScheme(phase) {
        let primaryColor, secondaryColor, accentColor, bgColorStart, bgColorEnd;

        switch(phase) {
            case 'general-ai':
                primaryColor = '#5e60ce';   // Purple
                secondaryColor = '#4ea8de'; // Light Blue
                accentColor = '#ff6b6b';    // Coral
                bgColorStart = '#0a0f2e';   // Dark Blue/Purple
                bgColorEnd = '#1a1a40';     // Dark Purple
                break;
            case 'superintelligence':
                primaryColor = '#7400b8';   // Deep Purple
                secondaryColor = '#ffc300'; // Gold
                accentColor = '#f94144';    // Red
                bgColorStart = '#1d002c';   // Very Dark Purple
                bgColorEnd = '#3c004e';     // Dark Magenta
                break;
            case 'narrow-ai':
            default:
                primaryColor = '#3a86ff';   // Blue
                secondaryColor = '#4cc9f0'; // Cyan
                accentColor = '#8338ec';    // Violet
                bgColorStart = '#03041a';   // Dark Blue
                bgColorEnd = '#121f3a';     // Deeper Blue
                break;
        }

        document.documentElement.style.setProperty('--primary-color', primaryColor);
        document.documentElement.style.setProperty('--secondary-color', secondaryColor);
        document.documentElement.style.setProperty('--accent-color', accentColor);
        document.documentElement.style.setProperty('--bg-color-start', bgColorStart);
        document.documentElement.style.setProperty('--bg-color-end', bgColorEnd);
    }

    // Trigger a special visual effect when transitioning phases
    function triggerPhaseTransitionEffect(phase) {
        // Create a fullscreen flash
        const flash = document.createElement('div');
        flash.className = 'phase-transition-flash';
        document.body.appendChild(flash);

        // Remove after animation
        setTimeout(() => {
            flash.remove();
        }, 2000);

        // Create expanding ring
        const ring = document.createElement('div');
        ring.className = 'phase-transition-ring';
        document.body.appendChild(ring);

        // Remove after animation
        setTimeout(() => {
            ring.remove();
        }, 3000);

        // Create many particles
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;

        // Determine color based on phase
        let color;
        switch(phase) {
            case 'narrow-ai':
                color = getComputedStyle(document.documentElement).getPropertyValue('--primary-color') || '#3a86ff';
                break;
            case 'general-ai':
                color = getComputedStyle(document.documentElement).getPropertyValue('--primary-color') || '#5e60ce';
                break;
            case 'superintelligence':
                color = getComputedStyle(document.documentElement).getPropertyValue('--primary-color') || '#7400b8';
                break;
            default:
                color = '#3a86ff';
        }

        // Create burst of particles
        for (let i = 0; i < 100; i++) {
            const angle = Math.random() * Math.PI * 2;
            const distance = 50 + Math.random() * 150;
            const x = centerX + Math.cos(angle) * distance;
            const y = centerY + Math.sin(angle) * distance;

            createParticle(x, y, color, {
                scale: 1.5 + Math.random(),
                duration: 3000 + Math.random() * 2000,
                endX: Math.cos(angle) * (window.innerWidth / 1.5), // Fly further out
                endY: Math.sin(angle) * (window.innerHeight / 1.5)
            });
        }

        // Trigger a screen shake
        triggerScreenShake(500, 10);

        // Show a phase label
        showPhaseLabel(phase);
    }

    // Show a centered phase label
    function showPhaseLabel(phase) {
        const label = document.createElement('div');
        label.className = 'phase-label';

        // Convert phase to title case for display
        const phaseTitle = phase.split('-').map(word =>
            word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ');

        label.innerHTML = `<span>Phase Reached:</span> ${phaseTitle}`;
        document.body.appendChild(label);

        // Apply entrance animation class
        label.classList.add('phase-label-in');

        // Remove entrance class and add exit class after delay
        setTimeout(() => {
            label.classList.remove('phase-label-in');
            label.classList.add('phase-label-out');
            // Remove element after exit animation completes
            setTimeout(() => {
                label.remove();
            }, 1000); // Match exit animation duration
        }, 4000); // How long the label stays visible
    }

    // Trigger screen shake effect
    function triggerScreenShake(duration = 300, intensity = 5) {
        const gameContainer = document.querySelector('.game-container') || document.body;

        // Store original position and setup for shake
        const originalTransform = gameContainer.style.transform;
        const originalPosition = window.getComputedStyle(gameContainer).position;
        if (originalPosition === 'static') {
            gameContainer.style.position = 'relative';
        }

        // Track shake start time
        const startTime = Date.now();

        // Create shake animation using requestAnimationFrame
        function shake() {
            const elapsed = Date.now() - startTime;
            if (elapsed < duration) {
                // Calculate decreasing intensity
                const progress = elapsed / duration;
                const currentIntensity = intensity * (1 - progress);

                // Apply random offset
                const offsetX = (Math.random() - 0.5) * 2 * currentIntensity;
                const offsetY = (Math.random() - 0.5) * 2 * currentIntensity;

                gameContainer.style.transform = `translate(${offsetX}px, ${offsetY}px)`;

                // Continue shake
                requestAnimationFrame(shake);
            } else {
                // Reset position
                gameContainer.style.transform = originalTransform || 'translate(0, 0)';

                // Reset position property if it was static before
                if (originalPosition === 'static') {
                    gameContainer.style.position = 'static';
                }
            }
        }

        // Start shake animation
        requestAnimationFrame(shake);
    }
    
    // Setup observer to watch for game state changes
    function setupStateObserver() {
        // Check for phase changes every second (adjust interval as needed)
        setInterval(() => {
            if (window.AGI && window.AGI.gameState) {
                updateUIFromGameState(window.AGI.gameState);
            } else {
                // Optional: Handle case where game state is not available yet
                // console.log("Waiting for AGI game state...");
            }
        }, 1000); // Check every 1000ms (1 second)
    }
    
    // Update UI based on game state
    function updateUIFromGameState(gameState) {
        if (!gameState || !gameState.resources || !gameState.progress) return;
        
        // Check if player has reached the threshold for full effects
        // Let's use a simpler threshold for now, e.g., entering General AI phase
        const hasFullEffects = ['general-ai', 'superintelligence'].includes(currentPhase);
        
        // Store this in a global property for other functions to use
        window.AGIUI.hasReachedEffectsThreshold = hasFullEffects;

        // Set effects intensity based on compute power (0-1 scale)
        // Cap compute power for intensity calculation to avoid extreme values
        const maxComputeForIntensity = 5000;
        effectsIntensity = Math.min(1, (gameState.resources.computePower || 0) / maxComputeForIntensity);
        window.AGIUI.effectsIntensity = effectsIntensity;
        
        // Get current phase and convert to kebab-case
        let phase = gameState.progress.phase || 'Narrow AI';
        phase = phase.toLowerCase().replace(/\s+/g, '-'); // Handle spaces correctly
        
        // Update phase class (only if changed)
        if (phase !== currentPhase) {
        updatePhaseClass(phase);
        }
        
        // Enhanced visual effects based on progress percentage
        const progressPercent = gameState.progress.phaseProgress || 0;
        updateProgressEffects(progressPercent, hasFullEffects);
        
        // Apply special effects based on attributes
        applyAttributeEffects(gameState.attributes, hasFullEffects);

        // Update digital rain intensity and activity
        digitalRainActive = (phase === 'general-ai' || phase === 'superintelligence') && hasFullEffects;
        updateDigitalRain(digitalRainActive, effectsIntensity);

        // Update floating orbs activity
        floatingOrbsActive = (phase === 'superintelligence') && hasFullEffects;
        updateFloatingOrbs(floatingOrbsActive, effectsIntensity);

        // Update energy grid activity
        energyGridActive = (phase === 'general-ai' || phase === 'superintelligence');
        updateEnergyGrid(energyGridActive, effectsIntensity);

        // Update lightning activity
        lightningActive = (phase === 'superintelligence') && hasFullEffects;
        updateLightningEffect(lightningActive, effectsIntensity);
        
        // Occasionally show a hint particle if below threshold
        if (!hasFullEffects && Math.random() < 0.05) { // 5% chance per check
            showHintEffect();
        }

        // Occasionally trigger lightning if active and based on intensity
        if (lightningActive && Math.random() < 0.03 * effectsIntensity) { // Up to 3% chance per check based on intensity
            triggerLightning();
        }

        // Occasionally create energy beams between elements
        if (hasFullEffects && Math.random() < 0.05 * effectsIntensity) {
            createRandomEnergyBeam();
        }

        // Update ambient background based on phase and intensity
        updateAmbientBackground(phase, effectsIntensity);
    }
    
    // Show a subtle hint effect to suggest what's to come
    function showHintEffect() {
        // Choose a random resource element to show effect near
        const resourceElements = document.querySelectorAll('.resource-display');
        if (resourceElements.length === 0) return;

        const targetElement = resourceElements[Math.floor(Math.random() * resourceElements.length)];

        if (targetElement) {
            const rect = targetElement.getBoundingClientRect();
            const x = rect.left + Math.random() * rect.width; // Random position within the element
            const y = rect.top + Math.random() * rect.height;
            
            // Create a subtle particle
            const particle = document.createElement('div');
            particle.className = 'hint-particle';
            particle.style.left = `${x}px`;
            particle.style.top = `${y}px`;

            // Use a phase-appropriate color, but subtly
            let color = getComputedStyle(document.documentElement).getPropertyValue('--primary-color') || '#3a86ff';
            particle.style.setProperty('--particle-color', color);
            
            // Add to document
            document.body.appendChild(particle);
            
            // Remove after animation
            setTimeout(() => {
                particle.remove();
            }, 3000); // Match CSS animation duration
        }
    }
    
    // Update visual effects based on progress percentage
    function updateProgressEffects(progressPercent, hasFullEffects) {
        // Apply basic effects even without threshold
        const panels = document.querySelectorAll('.panel');
        
        // Adjust panel glow intensity based on progress
        panels.forEach(panel => {
            // Calculate intensity (more progress = more intense glow on hover)
            const intensity = 0.5 + (progressPercent / 100) * 1 + (hasFullEffects ? 0.2 : 0);
            
            // Apply custom property for the hover state to use
            panel.style.setProperty('--hover-glow-intensity', intensity.toFixed(2));

            // Add subtle pulse animation for panels at higher progress
            const pulseOpacity = Math.min(0.4, (progressPercent / 100) * 1);
            panel.style.setProperty('--pulse-opacity', pulseOpacity.toFixed(2));
        });
        
        // Update progress bar effects
        const progressBarFill = document.querySelector('.progress-bar-fill'); // Target the fill element
        if (progressBarFill) {
            // More progress = faster shimmer animation
            const animationDuration = Math.max(0.5, 2 - (progressPercent / 100)); 
            progressBarFill.style.animationDuration = `${animationDuration}s`;

            // Add glow intensity for progress
            const glowIntensity = 0.3 + (progressPercent / 100) * 0.7;
            progressBarFill.style.setProperty('--progress-glow', glowIntensity.toFixed(2));
            // Also slightly increase glow opacity with progress
            progressBarFill.style.setProperty('--progress-glow-opacity', (0.5 + glowIntensity * 0.5).toFixed(2));
        }

        // Enhanced effects for buttons based on progress
        const buttons = document.querySelectorAll('.button:not(:disabled)');
        buttons.forEach(button => {
            // Add more pronounced hover effect for higher progress
            const hoverScale = 1 + (progressPercent / 100) * 0.05 + (hasFullEffects ? 0.05 : 0);
            button.style.setProperty('--button-hover-scale', hoverScale.toFixed(3));

            // More intense button glow at higher progress
            const glowIntensity = (progressPercent / 100) * 2 + (hasFullEffects ? 0.2 : 0);
            button.style.setProperty('--button-glow-intensity', glowIntensity.toFixed(2));
        });
    }
    
    // Apply visual effects based on attributes (intelligence, creativity, awareness)
    function applyAttributeEffects(attributes, hasFullEffects) {
        if (!attributes) return;
        
        // Normalize attributes (assuming a max of 10-20 for reasonable scaling)
        const maxAttribute = 20;
        const intelligence = Math.min(1, (attributes.intelligence || 0) / maxAttribute);
        const creativity = Math.min(1, (attributes.creativity || 0) / maxAttribute);
        const awareness = Math.min(1, (attributes.awareness || 0) / maxAttribute);
        
        // Calculate a "brilliance" factor that affects visual effects
        const brilliance = (intelligence + creativity + awareness) / 3;
        document.documentElement.style.setProperty('--brilliance-factor', brilliance.toFixed(2));

        // Apply subtle background pattern variation based on intelligence
        // (Managed mostly by updateAmbientBackground now)
        
        // Apply button effects based on creativity
        if (creativity > 0) {
            const buttons = document.querySelectorAll('.button:not(:disabled)');
            buttons.forEach(button => {
                // More creativity = more vibrant button effects (use brilliance here for combined effect)
                button.style.setProperty('--creative-factor', brilliance.toFixed(2));

                // Add a creative gradient border for higher creativity
                const borderOpacity = Math.min(1, creativity * 1.5); // Scale up effect
                button.style.setProperty('--border-gradient-opacity', borderOpacity.toFixed(2));
            });
        }
        
        // Apply panel effects based on awareness
        if (awareness > 0) {
            const panels = document.querySelectorAll('.panel');
            panels.forEach(panel => {
                // More awareness = more responsive panels (use brilliance)
                panel.style.setProperty('--awareness-factor', brilliance.toFixed(2));

                // Add subtle motion to panels based on awareness
                const panelMotion = Math.min(1, awareness * 1.2);
                panel.style.setProperty('--panel-motion', panelMotion.toFixed(2));
            });
        }

        // If attributes are high enough, add special effects
        const sentienceThreshold = 0.7; // 70% of max attribute (normalized)
        if (intelligence > sentienceThreshold && creativity > sentienceThreshold && awareness > sentienceThreshold && hasFullEffects) {
            // Add sentience effect class to body
            document.body.classList.add('sentience-effects');

            // Occasionally add a "sentience pulse"
            if (Math.random() < 0.015 * effectsIntensity) { // Slightly more frequent based on intensity
                triggerSentiencePulse();
            }
        } else {
            document.body.classList.remove('sentience-effects');
        }
    }

    // Trigger a sentience pulse effect
    function triggerSentiencePulse() {
        const pulse = document.createElement('div');
        pulse.className = 'sentience-pulse';
        // Use accent color for pulse
        pulse.style.setProperty('--pulse-color', getComputedStyle(document.documentElement).getPropertyValue('--accent-color') || '#f94144');
        document.body.appendChild(pulse);

        // Remove after animation
        setTimeout(() => {
            pulse.remove();
        }, 3000); // Match CSS animation
    }
    
    // Setup particle effects for resource gains
    function setupParticleEffects() {
        // Watch for resource value changes to create particles
        // Modified to observe a container and look for specific children changes
        observeResourceContainer();
        
        // Setup prestige particle effects
        setupPrestigeParticles();
    }
    
    // Observe resource container for changes in value spans
    function observeResourceContainer() {
        const resourceContainer = document.getElementById('resource-display-container');
        if (!resourceContainer) {
            console.warn("Resource display container not found. Particle effects on resource gain might not work.");
            return;
        }

        const observer = new MutationObserver(mutations => {
            mutations.forEach(mutation => {
                if (mutation.type === 'childList' || mutation.type === 'characterData') {
                    let targetNode = mutation.target;
                    
                    // If characterData changed, the target is the text node, get parent element
                if (mutation.type === 'characterData') {
                        targetNode = targetNode.parentElement;
                    }

                    // Find the resource element
                    let resourceElement = targetNode;
                    while (resourceElement && !resourceElement.classList?.contains('resource') && resourceElement !== resourceContainer) {
                        resourceElement = resourceElement.parentElement;
                    }

                    if (resourceElement && resourceElement.classList.contains('resource')) {
                        const valueSpan = resourceElement.querySelector('.resource-value');
                        if (valueSpan) {
                            const resourceId = resourceElement.dataset.resourceId;
                            const currentValue = parseFloat(valueSpan.textContent.replace(/,/g, '')) || 0;
                            const oldValue = parseFloat(valueSpan.dataset.oldValue || '0');

                            // Store the current value for next comparison
                            valueSpan.dataset.oldValue = currentValue.toString();

                            // Only create effects if there's an increase
                            if (currentValue > oldValue) {
                                const difference = currentValue - oldValue;
                                createResourceParticles(valueSpan, difference);
                                createDigitalNumberEffect(valueSpan, `+${Math.floor(difference)}`);
                                
                                // Add the resource-change class for the pop animation
                                valueSpan.classList.add('resource-change');
                                setTimeout(() => {
                                    valueSpan.classList.remove('resource-change');
                                }, 300);
                            }
                        }
                    }
                }
            });
        });
        
        observer.observe(resourceContainer, {
            childList: true,
                subtree: true,
            characterData: true
        });
    }
    
    // Create resource gain particles
    function createResourceParticles(element, amount) {
        if (!element) return;
        
        const rect = element.getBoundingClientRect();
        const particleCount = Math.min(Math.ceil(amount * 2), 30); // More particles
        
        // Create particles
        for (let i = 0; i < particleCount; i++) {
            // Create main particle
            const particle = document.createElement('div');
            particle.className = 'data-particle';
            document.body.appendChild(particle);
            
            // Random starting position within the element
            const startX = rect.left + (rect.width * Math.random());
            const startY = rect.top + (rect.height * Math.random());
            
            // Calculate angle for upward arc with more spread
            const angleSpread = Math.PI * 0.8; // 144 degrees spread
            const baseAngle = -Math.PI / 2; // Start from pointing up
            const angle = baseAngle + (angleSpread * (Math.random() - 0.5));
            
            // Randomize distance with greater range
            const minDistance = 100;
            const maxDistance = 200;
            const distance = minDistance + Math.random() * (maxDistance - minDistance);
            
            // Calculate end position
            const endX = Math.cos(angle) * distance;
            const endY = Math.sin(angle) * distance;
            
            // Set initial position
            particle.style.left = `${startX}px`;
            particle.style.top = `${startY}px`;
            
            // Set animation variables
            particle.style.setProperty('--flow-x', `${endX}px`);
            particle.style.setProperty('--flow-y', `${endY}px`);
            
            // Randomize particle size (bigger range)
            const size = 3 + Math.random() * 5;
            particle.style.width = `${size}px`;
            particle.style.height = `${size}px`;
            
            // Randomize animation duration
            const duration = 600 + Math.random() * 800;
            particle.style.animation = `particleFlow ${duration}ms cubic-bezier(0.4, 0, 0.2, 1) forwards`;
            
            // Create trailing particles
            for (let j = 0; j < 2; j++) {
                const trail = document.createElement('div');
                trail.className = 'particle-trail';
                document.body.appendChild(trail);
                trail.style.left = `${startX}px`;
                trail.style.top = `${startY}px`;
                trail.style.setProperty('--flow-x', `${endX * 0.7}px`);
                trail.style.setProperty('--flow-y', `${endY * 0.7}px`);
                trail.style.animationDelay = `${j * 100}ms`;
                
                setTimeout(() => document.body.removeChild(trail), duration);
            }
            
            particle.addEventListener('animationend', () => {
                document.body.removeChild(particle);
            });
        }
    }

    function createDigitalNumberEffect(element, text, endX, endY) {
        if (!element) return;
        
        const rect = element.getBoundingClientRect();
        const popup = document.createElement('div');
        popup.className = 'resource-popup';
        popup.textContent = text;
        
        // Position popup
        popup.style.left = `${rect.left + rect.width / 2}px`;
        popup.style.top = `${rect.top + rect.height / 2}px`;
        
        // Set movement direction
        popup.style.setProperty('--end-x', `${endX}px`);
        popup.style.setProperty('--end-y', `${endY}px`);
        
        document.body.appendChild(popup);
        
        // Remove after animation
        popup.addEventListener('animationend', () => {
            document.body.removeChild(popup);
        });
    }

    function createEnergyBeam(element) {
        if (!element) return;
        
        const rect = element.getBoundingClientRect();
        const beam = document.createElement('div');
        beam.className = 'energy-beam';
        
        beam.style.left = `${rect.left + rect.width / 2}px`;
        beam.style.top = `${rect.top}px`;
        beam.style.height = `${rect.height}px`;
        
        document.body.appendChild(beam);
        
        beam.addEventListener('animationend', () => {
            document.body.removeChild(beam);
        });
    }

    function createCircuitTrace(element) {
        if (!element) return;
        
        const rect = element.getBoundingClientRect();
        const trace = document.createElement('div');
        trace.className = 'circuit-trace';
        
        trace.style.left = `${rect.left}px`;
        trace.style.top = `${rect.top + rect.height / 2}px`;
        trace.style.width = `${rect.width}px`;
        
        document.body.appendChild(trace);
        
        trace.addEventListener('animationend', () => {
            document.body.removeChild(trace);
        });
    }

    function createShockwave(event, button) {
        if (!event || !button) return;
        
        const rect = button.getBoundingClientRect();
        const shockwave = document.createElement('div');
        shockwave.className = 'shockwave';
        
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        
        shockwave.style.left = `${x}px`;
        shockwave.style.top = `${y}px`;
        
        button.appendChild(shockwave);
        
        shockwave.addEventListener('animationend', () => {
            button.removeChild(shockwave);
        });
    }

    // Initialize all effects
    function initEffects() {
        // Create tech grid background
        const techGrid = document.createElement('div');
        techGrid.className = 'tech-grid';
        document.body.insertBefore(techGrid, document.body.firstChild);
        
        // Add effects only to action buttons (compute, collect, train, research, improve)
        const actionButtons = [
            'computeButton',
            'collectDataButton',
            'trainButton',
            'researchButton',
            'improveButton'
        ];
        
        actionButtons.forEach(buttonId => {
            const button = document.getElementById(buttonId);
            if (button) {
                button.addEventListener('click', (e) => {
                    createShockwave(e, button);
                    createSparks(e, button);
                    createEnergyBeam(button);
                    createCircuitTrace(button);
                });
                
                // Add hover effect
                button.addEventListener('mouseenter', () => {
                    if (!button.disabled) {
                        createCircuitTrace(button);
                    }
                });
            }
        });
        
        // Setup resource observers
        setupParticleEffects();
        
        // Add resource container effects
        const resourceContainer = document.getElementById('resource-display-container');
        if (resourceContainer) {
            resourceContainer.querySelectorAll('.resource').forEach(resource => {
                resource.addEventListener('mouseenter', () => {
                    createCircuitTrace(resource);
                });
            });
        }
    }

    // Call initEffects when DOM is loaded
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(initEffects, 100); // Small delay to ensure DOM is ready
    });
    
    // Create a single particle element
    function createParticle(x, y, color, options = {}) {
        // Limit active particles for performance
        if (activeParticles >= MAX_PARTICLES) return;
        activeParticles++;

        // Default options
        const defaults = {
            endX: (Math.random() - 0.5) * 100, // Random horizontal end drift
            endY: -50 - Math.random() * 50,   // Default upward drift
            scale: 1,                         // Default size scale
            duration: 1500 + Math.random() * 500, // Default lifespan
            type: 'default'                   // Allows different particle types later
        };

        // Merge options with defaults
        const settings = {...defaults, ...options};

        const particle = document.createElement('div');
        particle.className = 'resource-particle'; // Base class
        // Add type class if specified
        if (settings.type !== 'default') {
            particle.classList.add(`particle-${settings.type}`);
        }

        particle.style.left = `${x}px`;
        particle.style.top = `${y}px`;
        particle.style.backgroundColor = color; // Direct color setting

        // Randomize initial rotation slightly for variation
        particle.style.transform = `rotate(${Math.random() * 90 - 45}deg) scale(0)`; // Start scaled down

        // Particle size respects scale option
        const baseSize = 4; // Base size in pixels
        const size = Math.max(1, Math.floor(baseSize + Math.random() * 3) * settings.scale);
        particle.style.width = `${size}px`;
        particle.style.height = `${size}px`;
        particle.style.borderRadius = (Math.random() > 0.3) ? '50%' : '0'; // Mix squares and circles

        // Set custom properties for CSS animation
        particle.style.setProperty('--start-x', `${x}px`);
        particle.style.setProperty('--start-y', `${y}px`);
        particle.style.setProperty('--end-x-offset', `${settings.endX}px`);
        particle.style.setProperty('--end-y-offset', `${settings.endY}px`);
        particle.style.setProperty('--duration', `${settings.duration}ms`);
        particle.style.setProperty('--scale-final', '1'); // Can override if needed


        // Add to document body for correct absolute positioning
        document.body.appendChild(particle);
        
        // Trigger animation by adding a class after a short delay (ensures transition works)
        requestAnimationFrame(() => {
             requestAnimationFrame(() => { // Double requestAnimationFrame for safety
                 particle.classList.add('particle-active');
             });
        });


        // Remove after animation duration + small buffer
        setTimeout(() => {
             if (particle.parentNode) {
                particle.remove();
             }
            activeParticles--;
        }, settings.duration + 100); // Add buffer

        return particle;
    }


    // Show resource difference popup (alternative to digital number)
    function showResourceDiff(element, text) {
        const diff = document.createElement('div');
        diff.className = 'resource-diff';
        diff.textContent = text;
        
        // Position relative to the element
        const rect = element.getBoundingClientRect();
        diff.style.left = `${rect.left + rect.width / 2}px`;
        diff.style.top = `${rect.top}px`; // Start at the top

         // Determine color based on resource type if possible
         const resourceId = element.dataset.resourceId;
         let color;
         switch (resourceId) {
            case 'computePower': color = '#3a86ff'; break;
            case 'dataPoints': color = '#4cc9f0'; break;
            case 'researchPoints': color = '#5e60ce'; break;
            case 'energy': color = '#ffc300'; break;
            default: color = '#ffffff';
        }
        diff.style.color = color;

        // Add to body for absolute positioning
        document.body.appendChild(diff);

        // Remove after animation (match CSS)
        setTimeout(() => {
            diff.remove();
        }, 1500);
    }
    
    // Setup prestige particle effects
    function setupPrestigeParticles() {
        // Watch for prestige button click
        // Use event delegation on a container if the button might be replaced
        document.body.addEventListener('click', function(event) {
            const prestigeButton = event.target.closest('#prestigeButton'); // Find button clicked or its parent
            if (prestigeButton && !prestigeButton.disabled) {
                 triggerPrestigeEffect(prestigeButton);
            }
        });
    }
    
    // Trigger prestige visual effect
    function triggerPrestigeEffect(button) {
        if (!button) return;
        
        const rect = button.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const prestigeColor = getComputedStyle(document.documentElement).getPropertyValue('--super-accent-color') || '#7400b8'; // Define a super accent color

        // Create a burst of high-energy particles
        const particleCount = 100 + Math.floor(effectsIntensity * 100); // More particles with intensity
        for (let i = 0; i < particleCount; i++) {
            // Radial burst outwards
            const angle = Math.random() * Math.PI * 2;
            const distance = 10 + Math.random() * 20; // Start near center
            const speed = 300 + Math.random() * 400; // Faster particles
            const x = centerX + Math.cos(angle) * distance;
            const y = centerY + Math.sin(angle) * distance;
            
            createParticle(x, y, prestigeColor, {
                endX: Math.cos(angle) * speed * (1 + effectsIntensity), // Fly further with intensity
                endY: Math.sin(angle) * speed * (1 + effectsIntensity),
                scale: 1.8 + Math.random() * 1.2, // Larger particles
                duration: 2500 + Math.random() * 1500 // Longer lifespan
            });
        }

        // Create a shockwave
        const shockwave = document.createElement('div');
        shockwave.className = 'prestige-shockwave';
        shockwave.style.left = `${centerX}px`;
        shockwave.style.top = `${centerY}px`;
        shockwave.style.setProperty('--shockwave-color', prestigeColor);
        document.body.appendChild(shockwave);

        // Remove after animation
        setTimeout(() => {
            shockwave.remove();
        }, 1500); // Match CSS animation

        // Trigger screen shake
        triggerScreenShake(1000, 20 + effectsIntensity * 10); // Longer, more intense shake

        // Create massive energy pulse
        createEnergyPulse(centerX, centerY, prestigeColor);

        // Trigger multiple lightning strikes originating from the button
        const lightningStrikes = 5 + Math.floor(effectsIntensity * 5);
        for (let i = 0; i < lightningStrikes; i++) {
            setTimeout(() => {
                 // Trigger lightning originating near the button and striking outwards
                 triggerLightning(centerX, centerY, prestigeColor);
            }, i * (150 - effectsIntensity * 50)); // Faster strikes with intensity
        }
    }
    
    // Fix tooltip positioning to ensure they're always visible
    function fixTooltipPositions() {
         // Use event delegation on the body for dynamically added tooltips
         document.body.addEventListener('mouseenter', event => {
            const tooltipTrigger = event.target.closest('[data-tooltip]'); // Assuming triggers have data-tooltip attribute
            if (!tooltipTrigger) return;

            let tooltipTextElement = tooltipTrigger.querySelector('.tooltiptext');

            // If not found, maybe it's generated dynamically or positioned elsewhere.
            // This part might need adjustment based on actual tooltip implementation.
            // For now, let's assume it's a direct child or sibling setup is handled by CSS initially.

            // A simple approach if tooltips are always absolutely positioned relative to body:
             // Check if a tooltip element already exists for this trigger or create one?
             // Let's assume the tooltip element exists and becomes visible on hover via CSS.
             // We adjust its position *after* it becomes visible.

            // Need a slight delay for the browser to render the tooltip and calculate its size/position
             setTimeout(() => {
                 // Find the potentially visible tooltip text element associated with the trigger
                 // This depends heavily on how tooltips are structured and shown.
                 // Let's assume the trigger *has* the tooltip text inside it or referenced by an ID/aria-describedby.
                 const tooltipId = tooltipTrigger.getAttribute('aria-describedby');
                 if (tooltipId) {
                     tooltipTextElement = document.getElementById(tooltipId);
                 } else if (!tooltipTextElement) {
                     // Fallback: Check common patterns (e.g., sibling)
                     tooltipTextElement = tooltipTrigger.nextElementSibling;
                     if (!tooltipTextElement || !tooltipTextElement.classList.contains('tooltiptext')) {
                         tooltipTextElement = tooltipTrigger.querySelector('.tooltiptext');
                     }
                 }


                 if (!tooltipTextElement || window.getComputedStyle(tooltipTextElement).visibility === 'hidden') return; // Only adjust visible tooltips


                const tooltipRect = tooltipTextElement.getBoundingClientRect();
                const triggerRect = tooltipTrigger.getBoundingClientRect();
                const viewportWidth = window.innerWidth;
                const viewportHeight = window.innerHeight;
                const spacing = 5; // Px spacing from edge

                let newLeft = tooltipRect.left;
                let newTop = tooltipRect.top;
                let transformX = '0';
                let transformY = '0'; // Use transforms for fine-tuning if needed

                 // Check horizontal overflow
                 if (tooltipRect.right > viewportWidth - spacing) {
                    // Option 1: Flip to the left of the trigger
                     // newLeft = triggerRect.left - tooltipRect.width - spacing;
                    // Option 2: Align right edge with viewport edge
                     newLeft = viewportWidth - tooltipRect.width - spacing;
                 } else if (tooltipRect.left < spacing) {
                     // Option 1: Flip to the right of the trigger
                     // newLeft = triggerRect.right + spacing;
                    // Option 2: Align left edge with viewport edge
                     newLeft = spacing;
                }
                
                // Check vertical overflow
                 if (tooltipRect.bottom > viewportHeight - spacing) {
                     // Position above the trigger element instead of default
                     newTop = triggerRect.top - tooltipRect.height - spacing;
                 } else if (tooltipRect.top < spacing) {
                     // Position below the trigger element
                     newTop = triggerRect.bottom + spacing;
                 }

                 // Apply adjustments IF they changed significantly (avoid jitter)
                 if (Math.abs(newLeft - tooltipRect.left) > 1 || Math.abs(newTop - tooltipRect.top) > 1) {
                     tooltipTextElement.style.left = `${newLeft}px`;
                     tooltipTextElement.style.top = `${newTop}px`;
                    // Reset potentially conflicting CSS positioning like 'right', 'bottom' or transforms
                    tooltipTextElement.style.right = 'auto';
                    tooltipTextElement.style.bottom = 'auto';
                    tooltipTextElement.style.transform = 'translate(0, 0)'; // Override potential CSS transforms
                 }

             }, 50); // Small delay

         }, true); // Use capture phase to catch event early if needed
    }


    // Initialize element animations (hover, click)
    function initAnimations() {
        // Use event delegation for dynamically added elements

        // Panel Hover Effects
        document.body.addEventListener('mouseenter', event => {
            const panel = event.target.closest('.panel');
            if (!panel) return;

            // Add subtle glow effect class
            panel.classList.add('panel-hover-active'); // Use a different class to avoid conflicts

            // Trigger small particle burst if above threshold
            if (window.AGIUI.hasReachedEffectsThreshold && effectsIntensity > 0.2) {
                const rect = panel.getBoundingClientRect();
                const color = getComputedStyle(document.documentElement).getPropertyValue('--primary-color') || '#3a86ff';
                 const particleCount = 2 + Math.floor(effectsIntensity * 4);

                // Create particles originating from the mouse entry point on the panel border
                 const edgeX = Math.max(rect.left, Math.min(rect.right, event.clientX));
                 const edgeY = Math.max(rect.top, Math.min(rect.bottom, event.clientY));


                for (let i = 0; i < particleCount; i++) {
                    createParticle(edgeX, edgeY, color, {
                        endX: (Math.random() - 0.5) * 60 * effectsIntensity, // Small outward drift
                        endY: (Math.random() - 0.5) * 60 * effectsIntensity,
                        scale: 0.6 + Math.random() * 0.4,
                        duration: 800 + Math.random() * 400
                    });
                }
            }
        }, true); // Use capture phase

        document.body.addEventListener('mouseleave', event => {
            const panel = event.target.closest('.panel');
            if (panel) {
                panel.classList.remove('panel-hover-active');
            }
        }, true); // Use capture phase


        // Button Click Effects
        document.body.addEventListener('click', event => {
            const button = event.target.closest('.button');
            if (!button || button.disabled) return;

             // Basic Ripple Effect (always show)
             createRippleEffect(event, button);

            // Enhanced effects if threshold reached
            if (window.AGIUI.hasReachedEffectsThreshold && effectsIntensity > 0.1) {
                 createSparks(event, button);
                 // Add a small shockwave only for important buttons or high intensity?
                 if (button.classList.contains('button-primary') || effectsIntensity > 0.7) {
                    createShockwave(event, button, 0.5); // Smaller shockwave
                 }
            }
        });
    }
    
    // Create ripple effect on click
    function createRippleEffect(event, button) {
        const ripple = document.createElement('span');
        ripple.className = 'ripple';
        
        // Position ripple at click position relative to the button
        const rect = button.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        
        ripple.style.left = `${x}px`;
        ripple.style.top = `${y}px`;
        
        // Add ripple specific color based on button type or phase?
        // ripple.style.setProperty('--ripple-color', 'var(--accent-color)');

        // Add to button - ensure button has position: relative or absolute
        if (window.getComputedStyle(button).position === 'static') {
            button.style.position = 'relative';
        }
        button.style.overflow = 'hidden'; // Clip ripple to button bounds
        button.appendChild(ripple);
        
        // Remove after animation (match CSS)
        setTimeout(() => {
            ripple.remove();
        }, 600);
    }
    
    // Create sparks on button click
    function createSparks(event, button) {
        if (!event || !button) return;
        
        const rect = button.getBoundingClientRect();
        const sparkCount = 20; // More sparks for action buttons
        
        for (let i = 0; i < sparkCount; i++) {
            const spark = document.createElement('div');
            spark.className = 'spark';
            document.body.appendChild(spark);
            
            // Position spark at click point
            const x = event.clientX;
            const y = event.clientY;
            
            spark.style.left = `${x}px`;
            spark.style.top = `${y}px`;
            
            // Random angle and distance with more spread
            const angle = (Math.random() * Math.PI * 2);
            const distance = 100 + Math.random() * 100; // Larger distance for more dramatic effect
            const endX = Math.cos(angle) * distance;
            const endY = Math.sin(angle) * distance;
            
            spark.style.setProperty('--end-x', `${endX}px`);
            spark.style.setProperty('--end-y', `${endY}px`);
            
            // Randomize spark size
            const size = 2 + Math.random() * 4;
            spark.style.width = `${size}px`;
            spark.style.height = `${size}px`;
            
            // Randomize animation duration
            const duration = 500 + Math.random() * 500;
            spark.style.animation = `sparkFly ${duration}ms forwards cubic-bezier(0.4, 0, 0.2, 1)`;
            
            spark.addEventListener('animationend', () => {
                document.body.removeChild(spark);
            });
        }
    }

    // Create small shockwave on button click
    function createShockwave(event, button, scale = 1) {
        const rect = button.getBoundingClientRect();
        const centerX = event.clientX; // Use click position
        const centerY = event.clientY;

        const shockwave = document.createElement('div');
        shockwave.className = 'click-shockwave'; // Different class for styling
        shockwave.style.left = `${centerX}px`;
        shockwave.style.top = `${centerY}px`;

         // Use button's color or accent color
        const color = getComputedStyle(document.documentElement).getPropertyValue('--accent-color') || '#ff6b6b';
        shockwave.style.setProperty('--shockwave-color', color);
        shockwave.style.setProperty('--shockwave-scale', scale); // Control size via CSS variable


        document.body.appendChild(shockwave);

        // Remove after animation (match CSS)
        setTimeout(() => {
             if(shockwave.parentNode) shockwave.remove();
        }, 800); // Adjust duration based on CSS animation
    }

    // Initialize canvases and containers for advanced effects
    function initAdvancedEffects() {
        // Create containers if they don't exist
        let effectsContainer = document.getElementById('agi-effects-container');
        if (!effectsContainer) {
            effectsContainer = document.createElement('div');
            effectsContainer.id = 'agi-effects-container';
            effectsContainer.style.position = 'fixed';
            effectsContainer.style.top = '0';
            effectsContainer.style.left = '0';
            effectsContainer.style.width = '100%';
            effectsContainer.style.height = '100%';
            effectsContainer.style.zIndex = '-10'; // Ensure it's behind UI elements
            effectsContainer.style.pointerEvents = 'none'; // Don't interfere with clicks
            document.body.insertBefore(effectsContainer, document.body.firstChild);
        }

        // Helper to create a canvas
        const createCanvas = (id) => {
            let canvas = document.getElementById(id);
            if (!canvas) {
                canvas = document.createElement('canvas');
                canvas.id = id;
                canvas.style.position = 'absolute';
                canvas.style.top = '0';
                canvas.style.left = '0';
                canvas.style.width = '100%';
                canvas.style.height = '100%';
                effectsContainer.appendChild(canvas);
            }
            // Set canvas resolution to match display size
            canvas.width = canvas.offsetWidth;
            canvas.height = canvas.offsetHeight;
            return canvas;
        };

        // Create canvases
        ambientBackgroundCanvas = createCanvas('ambient-bg-canvas');
        ambientBackgroundCtx = ambientBackgroundCanvas.getContext('2d');

        energyGridCanvas = createCanvas('energy-grid-canvas');
        energyGridCtx = energyGridCanvas.getContext('2d');

        digitalRainCanvas = createCanvas('digital-rain-canvas');
        digitalRainCtx = digitalRainCanvas.getContext('2d');
        digitalRainCanvas.style.opacity = '0'; // Start hidden

        lightningCanvas = createCanvas('lightning-canvas');
        lightningCtx = lightningCanvas.getContext('2d');
        lightningCanvas.style.opacity = '0'; // Start hidden

        // Create container for floating orbs (DOM elements)
        floatingOrbsContainer = document.getElementById('floating-orbs-container');
        if (!floatingOrbsContainer) {
            floatingOrbsContainer = document.createElement('div');
            floatingOrbsContainer.id = 'floating-orbs-container';
            floatingOrbsContainer.style.position = 'absolute';
            floatingOrbsContainer.style.top = '0';
            floatingOrbsContainer.style.left = '0';
            floatingOrbsContainer.style.width = '100%';
            floatingOrbsContainer.style.height = '100%';
            floatingOrbsContainer.style.pointerEvents = 'none';
            floatingOrbsContainer.style.opacity = '0'; // Start hidden
            effectsContainer.appendChild(floatingOrbsContainer);
        }

        // Handle window resize
        window.addEventListener('resize', () => {
             [ambientBackgroundCanvas, energyGridCanvas, digitalRainCanvas, lightningCanvas].forEach(canvas => {
                if (canvas) {
                    canvas.width = canvas.offsetWidth;
                    canvas.height = canvas.offsetHeight;
                }
             });
             // Reinitialize effects that depend on screen size
             setupDigitalRain(); // Recalculate columns
             createEnergyGrid(); // Recreate nodes
        });
    }

    // --- Ambient Background ---
    function createAmbientBackground() {
        // Initial setup is done in initAdvancedEffects
        // Drawing happens in the animation loop via updateAmbientBackground
        console.log("Ambient Background initialized");
    }

    function updateAmbientBackground(phase, intensity) {
        if (!ambientBackgroundCtx || !ambientBackgroundCanvas) return;

        const ctx = ambientBackgroundCtx;
        const canvas = ambientBackgroundCanvas;
        const width = canvas.width;
        const height = canvas.height;

        // Clear canvas
        ctx.clearRect(0, 0, width, height);

        // Base gradient based on phase colors
        const bgColorStart = getComputedStyle(document.documentElement).getPropertyValue('--bg-color-start') || '#03041a';
        const bgColorEnd = getComputedStyle(document.documentElement).getPropertyValue('--bg-color-end') || '#121f3a';
        const gradient = ctx.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, bgColorStart);
        gradient.addColorStop(1, bgColorEnd);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);

        // Add subtle noise/static based on intensity
        if (intensity > 0.1) {
            const imageData = ctx.getImageData(0, 0, width, height);
            const data = imageData.data;
            const noiseIntensity = intensity * 30; // Max noise level

            for (let i = 0; i < data.length; i += 4) {
                const noise = (Math.random() - 0.5) * noiseIntensity;
                data[i] += noise;     // Red
                data[i + 1] += noise; // Green
                data[i + 2] += noise; // Blue
            }
            ctx.putImageData(imageData, 0, 0);
        }

         // Add subtle, slow-moving radial gradients based on attributes/phase
        const brilliance = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--brilliance-factor') || '0');
        const numGlows = 1 + Math.floor(brilliance * 3);
        const baseRadius = width * 0.3 + brilliance * width * 0.3;
        const time = Date.now() * 0.00005; // Slow movement

        for (let i = 0; i < numGlows; i++) {
             let glowColor;
             switch (phase) {
                case 'general-ai': glowColor = `rgba(94, 96, 206, ${0.05 + intensity * 0.1})`; break; // Purple-ish
                case 'superintelligence': glowColor = `rgba(116, 0, 184, ${0.08 + intensity * 0.15})`; break; // Deep purple
                default: glowColor = `rgba(58, 134, 255, ${0.03 + intensity * 0.07})`; break; // Blue
             }

             const x = width * 0.5 + Math.sin(time * (1 + i * 0.3)) * width * 0.2;
             const y = height * 0.5 + Math.cos(time * (1 + i * 0.2)) * height * 0.2;
             const radius = baseRadius * (0.8 + Math.sin(time * 1.5 + i) * 0.2);

             const radialGradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
             radialGradient.addColorStop(0, glowColor);
             radialGradient.addColorStop(1, 'rgba(0,0,0,0)');
             ctx.fillStyle = radialGradient;
             ctx.fillRect(0, 0, width, height); // Apply gradient over the whole canvas
        }
    }

    // --- Energy Grid ---
    function createEnergyGrid() {
        if (!energyGridCanvas) return;
        energyGridNodes = [];
        const density = 30 + effectsIntensity * 30; // Adjust density based on intensity
        const cols = Math.ceil(energyGridCanvas.width / density);
        const rows = Math.ceil(energyGridCanvas.height / density);

        for (let i = 0; i <= cols; i++) {
            for (let j = 0; j <= rows; j++) {
                energyGridNodes.push({
                    x: i * density + (Math.random() - 0.5) * density * 0.5, // Add jitter
                    y: j * density + (Math.random() - 0.5) * density * 0.5,
                    originalX: i * density,
                    originalY: j * density,
                    vx: 0, // Velocity for subtle movement
                    vy: 0
                });
            }
        }
        console.log(`Energy Grid created with ${energyGridNodes.length} nodes.`);
    }

    function updateEnergyGrid(isActive, intensity) {
        if (!energyGridCtx || !energyGridCanvas || !isActive || intensity === 0) {
             if(energyGridCtx) energyGridCtx.clearRect(0, 0, energyGridCanvas.width, energyGridCanvas.height);
             return; // Clear if inactive or zero intensity
        }

        const ctx = energyGridCtx;
        const canvas = energyGridCanvas;
        const width = canvas.width;
        const height = canvas.height;
        ctx.clearRect(0, 0, width, height);

        const maxDist = 80 + intensity * 50; // Connection distance
        const nodeSize = 1 + intensity * 1.5;
        const lineWidth = 0.5 + intensity * 1;
        const gridColor = currentPhase === 'superintelligence'
                         ? `rgba(116, 0, 184, ${0.3 + intensity * 0.5})` // Purple
                         : `rgba(94, 96, 206, ${0.2 + intensity * 0.4})`; // Blue/Purple


        ctx.strokeStyle = gridColor;
        ctx.fillStyle = gridColor;
        ctx.lineWidth = lineWidth;

        energyGridNodes.forEach(node => {
            // Simple physics for subtle movement (attraction to original position, slight random push)
            const attraction = 0.01;
            const randomPush = 0.1 * intensity;
            node.vx += (node.originalX - node.x) * attraction + (Math.random() - 0.5) * randomPush;
            node.vy += (node.originalY - node.y) * attraction + (Math.random() - 0.5) * randomPush;
            node.vx *= 0.95; // Dampening
            node.vy *= 0.95;
            node.x += node.vx;
            node.y += node.vy;

            // Keep nodes within bounds (simple wrap or bounce)
             if (node.x < 0 || node.x > width) node.vx *= -0.5;
             if (node.y < 0 || node.y > height) node.vy *= -0.5;
             node.x = Math.max(0, Math.min(width, node.x));
             node.y = Math.max(0, Math.min(height, node.y));


            // Draw node
            ctx.beginPath();
            ctx.arc(node.x, node.y, nodeSize, 0, Math.PI * 2);
            ctx.fill();

            // Connect to nearby nodes
            energyGridNodes.forEach(otherNode => {
                if (node === otherNode) return;
                const dx = node.x - otherNode.x;
                const dy = node.y - otherNode.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < maxDist) {
                    ctx.beginPath();
                    ctx.moveTo(node.x, node.y);
                    ctx.lineTo(otherNode.x, otherNode.y);
                    // Make lines fainter further away
                    ctx.globalAlpha = Math.max(0, (1 - dist / maxDist)) * (0.4 + intensity * 0.6);
                    ctx.stroke();
                    ctx.globalAlpha = 1.0; // Reset alpha
                }
            });
        });
    }

    // --- Digital Rain ---
    function setupDigitalRain() {
        if (!digitalRainCanvas) return;
        const fontSize = 14 + effectsIntensity * 4;
        digitalRainColumns = Math.floor(digitalRainCanvas.width / fontSize);
        digitalRainDrops = [];
        for (let i = 0; i < digitalRainColumns; i++) {
            // Start drops at random negative y positions to stagger entry
            digitalRainDrops[i] = Math.random() * -digitalRainCanvas.height * 2;
        }
        console.log(`Digital Rain setup with ${digitalRainColumns} columns.`);
    }

    function updateDigitalRain(isActive, intensity) {
        if (!digitalRainCtx || !digitalRainCanvas) return;

         if (!isActive || intensity < 0.1) {
             // Fade out and clear if becoming inactive
             if (parseFloat(digitalRainCanvas.style.opacity) > 0) {
                 digitalRainCanvas.style.transition = 'opacity 0.5s ease-out';
                 digitalRainCanvas.style.opacity = '0';
             }
             // Clear canvas once faded
    setTimeout(() => {
                if (!digitalRainActive) digitalRainCtx.clearRect(0, 0, digitalRainCanvas.width, digitalRainCanvas.height);
    }, 500);
            return;
         }

        // Fade in if becoming active
        if (parseFloat(digitalRainCanvas.style.opacity) < intensity * 0.7) {
             digitalRainCanvas.style.transition = 'opacity 0.5s ease-in';
             digitalRainCanvas.style.opacity = (intensity * 0.7).toFixed(2); // Max opacity based on intensity
        }

        const ctx = digitalRainCtx;
        const canvas = digitalRainCanvas;
        const width = canvas.width;
        const height = canvas.height;

        // Semi-transparent background to create fading trail effect
        const bgColor = currentPhase === 'superintelligence' ? 'rgba(29, 0, 44, 0.1)' : 'rgba(10, 15, 46, 0.1)';
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, width, height);

        // Choose colors based on phase
        const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--primary-color') || '#3a86ff';
        const accentColor = getComputedStyle(document.documentElement).getPropertyValue('--accent-color') || '#8338ec';
        ctx.fillStyle = primaryColor;

        const fontSize = 14 + intensity * 4; // Font size increases with intensity
        ctx.font = `${fontSize}px 'Roboto Mono', monospace`; // Use a monospace font

        // Characters to rain
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789<>/?;:[{]}=+-_*&^%$#@!~';

        for (let i = 0; i < digitalRainDrops.length; i++) {
            const x = i * fontSize;
            const y = digitalRainDrops[i] * fontSize;

            // Draw a random character
            const charIndex = Math.floor(Math.random() * chars.length);
            const character = chars[charIndex];

             // Occasionally draw the head character in accent color
            ctx.fillStyle = (Math.random() > 0.95) ? accentColor : primaryColor;

            ctx.fillText(character, x, y);

            // Move drop down
            digitalRainDrops[i]++;

            // Reset drop if it goes off screen, with random chance based on intensity
            if (y > height && Math.random() > (0.99 - intensity * 0.02)) {
                digitalRainDrops[i] = 0; // Reset to top
            }
        }
    }

    // --- Lightning Effect ---
    function setupLightningEffect() {
        // Initialization done in initAdvancedEffects
        console.log("Lightning Effect setup.");
    }

     function updateLightningEffect(isActive, intensity) {
         if (!lightningCanvas) return;

         if (!isActive || intensity < 0.2) {
             // Fade out if becoming inactive
             if (parseFloat(lightningCanvas.style.opacity) > 0) {
                 lightningCanvas.style.transition = 'opacity 0.5s ease-out';
                 lightningCanvas.style.opacity = '0';
             }
              // No persistent drawing needed, clearing happens per strike
             return;
         }

         // Fade in if becoming active (only needs to happen once)
          if (parseFloat(lightningCanvas.style.opacity) === 0) {
             lightningCanvas.style.transition = 'opacity 0.5s ease-in';
             lightningCanvas.style.opacity = '1'; // Full opacity when active
         }
         // Drawing happens only when triggerLightning is called
     }


    function triggerLightning(startX, startY, colorOverride = null) {
        if (!lightningCtx || !lightningCanvas || !lightningActive) return;

        const ctx = lightningCtx;
        const canvas = lightningCanvas;
        const width = canvas.width;
        const height = canvas.height;

        // Clear previous lightning
        ctx.clearRect(0, 0, width, height);

        // Determine start/end points
        const x1 = startX ?? Math.random() * width; // Start at specific point or random top edge
        const y1 = startY ?? 0;
        const x2 = startX ? startX + (Math.random() - 0.5) * width * 0.8 : Math.random() * width; // End near start or random bottom
        const y2 = startY ? startY + height * (0.5 + Math.random() * 0.5) : height;

        // Lightning properties
        const segments = 20 + Math.floor(effectsIntensity * 30); // More segments with intensity
        const maxOffset = 15 + effectsIntensity * 20;
        const numBranches = 1 + Math.floor(Math.random() * (3 + effectsIntensity * 3));
        const lightningColor = colorOverride || getComputedStyle(document.documentElement).getPropertyValue('--accent-color') || '#ffffff';


        function createBolt(startX, startY, endX, endY, thickness, branchLevel) {
            let points = [{ x: startX, y: startY }];
            let currentX = startX;
            let currentY = startY;
            const dx = endX - startX;
            const dy = endY - startY;
            const totalDist = Math.sqrt(dx * dx + dy * dy);

            for (let i = 1; i <= segments; i++) {
                const progress = i / segments;
                let offsetX = (Math.random() - 0.5) * maxOffset * (1 - progress); // More jagged near start
                let offsetY = (Math.random() - 0.5) * maxOffset * (1 - progress);

                 // Ensure offset is somewhat perpendicular to the main direction
                 let perpX = -dy / totalDist * offsetX;
                 let perpY = dx / totalDist * offsetX; // Use same random magnitude for perpendicular


                currentX = startX + dx * progress + perpX;
                currentY = startY + dy * progress + perpY;
                points.push({ x: currentX, y: currentY });

                 // Chance to branch off (less likely on deeper branches)
                 if (branchLevel < 3 && i > segments * 0.2 && i < segments * 0.8 && Math.random() < 0.15 * effectsIntensity) {
                     const branchEndX = currentX + (Math.random() - 0.5) * totalDist * 0.5;
                     const branchEndY = currentY + (Math.random() - 0.5) * totalDist * 0.5;
                     createBolt(currentX, currentY, branchEndX, branchEndY, thickness * 0.6, branchLevel + 1);
                 }

            }
            points.push({ x: endX, y: endY }); // Ensure it reaches the end point

             // Draw the bolt segment
             ctx.beginPath();
             ctx.moveTo(points[0].x, points[0].y);
             for (let j = 1; j < points.length; j++) {
                ctx.lineTo(points[j].x, points[j].y);
             }
             ctx.strokeStyle = lightningColor;
             ctx.lineWidth = Math.max(0.5, thickness * (0.5 + Math.random() * 0.5)); // Vary thickness
             ctx.lineCap = 'round';
             ctx.globalAlpha = 0.6 + Math.random() * 0.4; // Vary opacity
             ctx.shadowColor = lightningColor;
             ctx.shadowBlur = 10 + thickness * 5;
             ctx.stroke();
             ctx.globalAlpha = 1.0; // Reset alpha
             ctx.shadowBlur = 0; // Reset shadow
        }


        // Create main bolt and potential initial branches
        createBolt(x1, y1, x2, y2, 3 + effectsIntensity * 4, 0); // Main bolt thickness based on intensity
        for(let b = 0; b < numBranches; b++) {
             const branchEndX = x1 + (Math.random() - 0.5) * width;
             const branchEndY = y1 + Math.random() * height;
             createBolt(x1, y1, branchEndX, branchEndY, (1 + effectsIntensity * 2) * 0.7, 1); // Branches are thinner
        }


        // Flash effect
        const flash = document.createElement('div');
        flash.className = 'lightning-flash';
        flash.style.backgroundColor = lightningColor;
        document.body.appendChild(flash);

        // Fade out the lightning bolt drawing itself quickly
        setTimeout(() => {
            ctx.clearRect(0, 0, width, height);
        }, 100 + Math.random() * 100); // Bolt lasts very short time

        // Remove flash element after its animation
         setTimeout(() => {
            flash.remove();
        }, 500); // Match CSS flash duration
    }


    // --- Floating Orbs ---
    function setupFloatingOrbs() {
        // Init done in initAdvancedEffects
        console.log("Floating Orbs setup.");
        floatingOrbs = []; // Reset orbs array
    }

    function updateFloatingOrbs(isActive, intensity) {
        if (!floatingOrbsContainer) return;

         if (!isActive || intensity < 0.3) {
             // Fade out if becoming inactive
             if (parseFloat(floatingOrbsContainer.style.opacity) > 0) {
                 floatingOrbsContainer.style.transition = 'opacity 0.5s ease-out';
                 floatingOrbsContainer.style.opacity = '0';
             }
             // Optional: Remove existing orb elements after fade
             setTimeout(() => {
                if (!floatingOrbsActive) {
                    floatingOrbsContainer.innerHTML = '';
                    floatingOrbs = [];
                }
             }, 500);
             return;
         }

         // Fade in if becoming active
         if (parseFloat(floatingOrbsContainer.style.opacity) < intensity * 0.8) {
             floatingOrbsContainer.style.transition = 'opacity 0.5s ease-in';
             floatingOrbsContainer.style.opacity = (intensity * 0.8).toFixed(2); // Max opacity based on intensity
         }

        const maxOrbs = 5 + Math.floor(intensity * 15);
        const width = floatingOrbsContainer.offsetWidth;
        const height = floatingOrbsContainer.offsetHeight;

        // Add new orbs if needed
        while (floatingOrbs.length < maxOrbs && Math.random() < 0.1 * intensity) {
            const orb = document.createElement('div');
            orb.className = 'floating-orb';
            const size = 10 + Math.random() * (20 + intensity * 30);
            orb.style.width = `${size}px`;
            orb.style.height = `${size}px`;
            orb.style.left = `${Math.random() * width}px`;
            orb.style.top = `${Math.random() * height}px`;

             // Color based on phase/intensity
            const orbColor = currentPhase === 'superintelligence' ? `hsl(280, 100%, ${60 + Math.random() * 20}%)` : `hsl(260, 80%, ${50 + Math.random() * 20}%)`;
            orb.style.setProperty('--orb-color', orbColor);


            floatingOrbsContainer.appendChild(orb);
            floatingOrbs.push({
                element: orb,
                x: parseFloat(orb.style.left),
                y: parseFloat(orb.style.top),
                vx: (Math.random() - 0.5) * (0.5 + intensity), // Speed based on intensity
                vy: (Math.random() - 0.5) * (0.5 + intensity),
                size: size
            });
        }

        // Update existing orbs
        floatingOrbs.forEach((orbData, index) => {
            // Move orb
            orbData.x += orbData.vx;
            orbData.y += orbData.vy;

            // Bounce off edges
            if (orbData.x < 0 || orbData.x > width - orbData.size) orbData.vx *= -1;
            if (orbData.y < 0 || orbData.y > height - orbData.size) orbData.vy *= -1;

             // Clamp position just in case
             orbData.x = Math.max(0, Math.min(width - orbData.size, orbData.x));
             orbData.y = Math.max(0, Math.min(height - orbData.size, orbData.y));


            orbData.element.style.left = `${orbData.x}px`;
            orbData.element.style.top = `${orbData.y}px`;

             // Randomly change velocity slightly
             if (Math.random() < 0.01) {
                 orbData.vx += (Math.random() - 0.5) * 0.2 * intensity;
                 orbData.vy += (Math.random() - 0.5) * 0.2 * intensity;
                 // Limit max speed
                 orbData.vx = Math.max(-1, Math.min(1, orbData.vx));
                 orbData.vy = Math.max(-1, Math.min(1, orbData.vy));
             }


            // Occasionally remove an orb if we have too many (less likely with high intensity)
             if (floatingOrbs.length > maxOrbs && Math.random() < (0.005 / (intensity + 0.1))) {
                 orbData.element.remove();
                 floatingOrbs.splice(index, 1);
             }
        });
    }

    // --- Pulse Effects ---
    function addPulseEffects() {
        // Add pulse class to elements that should pulse continuously based on phase/intensity
        // Example: Add to the main game title or key resource displays

        const titleElement = document.querySelector('h1'); // Or specific ID
        if (titleElement) {
            titleElement.classList.add('pulse-effect-target');
        }

        // Pulse intensity controlled via CSS variable updated in game state loop
        // document.documentElement.style.setProperty('--pulse-intensity', effectsIntensity);
        // The CSS would use this variable:
        // .pulse-effect-target { animation: pulse var(--pulse-speed, 2s) infinite ease-in-out; }
        // @keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: calc(0.6 + var(--pulse-intensity) * 0.4); transform: scale(calc(1 + var(--pulse-intensity) * 0.05)); } }
    }

    // --- Energy Beams ---
     function createRandomEnergyBeam() {
        // Disabled
        return;
    }

    function createEnergyBeam(x1, y1, x2, y2) {
        // Disabled
        return;
    }


    // --- Main Animation Loop ---
    function animationLoop(timestamp) {
        // Update effects that require continuous drawing (canvases)
        // Checks for activity are done within the update functions themselves

        // Only update if the game state indicates activity or high intensity
         if (window.AGI && window.AGI.gameState) {
            const state = window.AGI.gameState;
            const phase = (state.progress?.phase || 'Narrow AI').toLowerCase().replace(/\s+/g, '-');
            const intensity = window.AGIUI.effectsIntensity || 0;
            const hasFullEffects = window.AGIUI.hasReachedEffectsThreshold || false;
            const isActive = true; // Or check if game is paused?

             if (isActive) {
                updateAmbientBackground(phase, intensity); // Always running, varies by intensity/phase
                updateEnergyGrid(energyGridActive, intensity); // Active in later phases
                updateDigitalRain(digitalRainActive, intensity); // Active in later phases + threshold
                updateFloatingOrbs(floatingOrbsActive, intensity); // Active in superintelligence + threshold
                updateLightningEffect(lightningActive, intensity); // Handles its own visibility

                // Update CSS variables driven by time or intensity
                document.documentElement.style.setProperty('--pulse-intensity', intensity.toFixed(2));
                document.documentElement.style.setProperty('--time-factor', (timestamp % 10000 / 10000).toFixed(4)); // 0-1 over 10 seconds
             }
         }


        // Continue the loop
        requestAnimationFrame(animationLoop);
    }


    // --- Public Interface ---
    return {
        init: init, // Expose the init function
        // Expose other functions if needed for external control/debugging
        triggerPrestigeEffect: triggerPrestigeEffect,
        triggerScreenShake: triggerScreenShake,
        triggerPhaseTransitionEffect: triggerPhaseTransitionEffect, // For testing
        createParticle: createParticle // Allow creating particles externally
    };

})(); // End of IIFE

// Initialize the UI effects when the script loads and DOM is ready
// Use DOMContentLoaded to ensure elements are available
document.addEventListener('DOMContentLoaded', () => {
    // Optionally wait for the main AGI game object to be ready too
    // This depends on load order. If AGIUI loads after AGI, this check might be needed.
    if (window.AGI) {
         window.AGIUI.init();
    } else {
         // If AGI loads later, wait for a custom event or use a short delay
         console.log("AGI object not found yet, delaying AGIUI init slightly.");
         setTimeout(() => {
             if (window.AGI) {
                 window.AGIUI.init();
             } else {
                  console.error("AGI object failed to initialize. AGIUI effects cannot start.");
             }
         }, 500); // Wait 500ms
    }
});

// Update the animateResourceChange function to only do the pulse animation
function animateResourceChange(resourceId) {
    if (!gameState.settings.animationsEnabled) return;
    
    const resourceElement = document.getElementById(resourceId);
    if (!resourceElement) return;

    const rect = resourceElement.getBoundingClientRect();
    const particleCount = 8 + Math.floor(Math.random() * 5); // 8-12 particles

    for (let i = 0; i < particleCount; i++) {
        // Create main particle
        const particle = document.createElement('div');
        particle.className = 'data-particle';
        document.body.appendChild(particle);
        
        // Random starting position within the element
        const startX = rect.left + (rect.width * Math.random());
        const startY = rect.top + (rect.height * Math.random());
        
        // Calculate angle for upward arc with spread
        const angleSpread = Math.PI * 0.8; // 144 degrees spread
        const baseAngle = -Math.PI / 2; // Start from pointing up
        const angle = baseAngle + (angleSpread * (Math.random() - 0.5));
        
        // Randomize distance
        const distance = 50 + Math.random() * 50;
        
        // Calculate end position
        const endX = Math.cos(angle) * distance;
        const endY = Math.sin(angle) * distance;
        
        // Set initial position
        particle.style.left = `${startX}px`;
        particle.style.top = `${startY}px`;
        
        // Set animation variables
        particle.style.setProperty('--flow-x', `${endX}px`);
        particle.style.setProperty('--flow-y', `${endY}px`);
        
        // Add animation
        particle.style.animation = `particleFlow ${600 + Math.random() * 400}ms cubic-bezier(0.4, 0, 0.2, 1) forwards`;
        
        // Create trail particles
        for (let j = 0; j < 2; j++) {
            const trail = document.createElement('div');
            trail.className = 'particle-trail';
            document.body.appendChild(trail);
            trail.style.left = `${startX}px`;
            trail.style.top = `${startY}px`;
            trail.style.setProperty('--flow-x', `${endX * 0.7}px`);
            trail.style.setProperty('--flow-y', `${endY * 0.7}px`);
            trail.style.animationDelay = `${j * 50}ms`;
            
            setTimeout(() => trail.remove(), 600);
        }
        
        // Remove particle after animation
        setTimeout(() => particle.remove(), 1000);
    }
}