const STORAGE_KEY = 'wikiportraits_wizard_state';
const DOM = {};

const steps = [
    {
        id: 'welcome',
        title: 'Welcome to WikiPortraits',
        shortLabel: 'Welcome',
        template: 'welcome',
        requiredTasks: [],
        shouldShow: () => true,
        canProceed: () => state.userPath !== null
    },
    {
        id: 'account',
        title: 'Create a Wikimedia Account',
        shortLabel: 'Account',
        template: 'account',
        requiredTasks: ['account_created'],
        shouldShow: () => state.userPath === 'new' || state.userPath === null,
        canProceed: () => isStepComplete('account')
    },
    {
        id: 'attribution',
        title: 'Set Your Attribution Name',
        shortLabel: 'Attribution',
        template: 'attribution',
        requiredTasks: [],
        shouldShow: () => true,
        canProceed: () => true
    },
    {
        id: 'userpage',
        title: 'Create or Update Your User Page',
        shortLabel: 'User Page',
        template: 'userpage',
        requiredTasks: ['userpage_opened', 'userpage_intro', 'userpage_save'],
        shouldShow: () => true,
        canProceed: () => isStepComplete('userpage')
    },
    {
        id: 'upload',
        title: 'Upload Your First Photos',
        shortLabel: 'Upload',
        template: 'upload',
        requiredTasks: ['licensing_read', 'photo_uploaded'],
        shouldShow: () => true,
        canProceed: () => isStepComplete('upload')
    },
    {
        id: 'complete',
        title: "You're Ready!",
        shortLabel: 'Complete',
        template: 'complete',
        requiredTasks: [],
        shouldShow: () => true,
        canProceed: () => true
    }
];

let state = {
    currentStep: 0,
    userPath: null, // 'new' or 'existing'
    tasks: {},
    customData: {}
};

function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadState() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        try {
            state = JSON.parse(saved);
        } catch (e) {
            console.error('Failed to load saved state:', e);
            state = {
                currentStep: 0,
                userPath: null,
                tasks: {},
                customData: {}
            };
        }
    }
}

function resetState() {
    if (confirm('Are you sure you want to start over? All progress will be lost.')) {
        localStorage.removeItem(STORAGE_KEY);
        state = {
            currentStep: 0,
            userPath: null,
            tasks: {},
            customData: {}
        };
        init();
    }
}

function setTask(taskId, value) {
    state.tasks[taskId] = value;
    saveState();

    requestAnimationFrame(() => {
        updateStepIndicator();
        updateNavigationButtons();
        updateChecklistItemState(taskId, value);
    });
}

function getTask(taskId) {
    return state.tasks[taskId] || false;
}

function setCustomData(key, value) {
    state.customData[key] = value;
    saveState();
}

function getCustomData(key) {
    return state.customData[key];
}

function isStepComplete(stepId) {
    const step = steps.find(s => s.id === stepId);
    if (!step || !step.requiredTasks) return true;

    return step.requiredTasks.every(taskId => getTask(taskId));
}

function getStepStatus(stepIndex) {
    if (stepIndex < state.currentStep) {
        return isStepComplete(steps[stepIndex].id) ? 'completed' : 'visited';
    }
    if (stepIndex === state.currentStep) {
        return 'active';
    }
    return 'pending';
}

function getVisibleSteps() {
    return steps.filter(step => step.shouldShow());
}

function goToStep(index) {
    if (index < 0 || index >= steps.length) return;

    // Skip to next visible step if current is hidden
    while (index < steps.length && !steps[index].shouldShow()) {
        index++;
    }

    if (index >= steps.length) return;

    state.currentStep = index;
    saveState();
    updateUI();
}

function nextStep() {
    const currentStep = steps[state.currentStep];

    if (!currentStep.canProceed()) {
        const proceed = confirm('Some recommended tasks are not completed. Do you want to continue anyway?');
        if (!proceed) return;
    }

    let nextIndex = state.currentStep + 1;
    while (nextIndex < steps.length && !steps[nextIndex].shouldShow()) {
        nextIndex++;
    }

    if (nextIndex < steps.length) {
        goToStep(nextIndex);
    }
}

function prevStep() {
    let prevIndex = state.currentStep - 1;
    while (prevIndex >= 0 && !steps[prevIndex].shouldShow()) {
        prevIndex--;
    }

    if (prevIndex >= 0) {
        goToStep(prevIndex);
    }
}

function renderStepIndicator() {
    const container = DOM.stepIndicator;

    // Clear existing content
    container.innerHTML = '';

    const fragment = document.createDocumentFragment();
    const visibleSteps = getVisibleSteps();

    steps.forEach((step, index) => {
        const status = getStepStatus(index);
        const isSkipped = !step.shouldShow();

        const stepEl = document.createElement('div');
        stepEl.className = `wizard-step wizard-step--${status}`;
        if (isSkipped) {
            stepEl.classList.add('wizard-step--skipped');
        }
        stepEl.setAttribute('role', 'button');
        stepEl.setAttribute('tabindex', isSkipped ? '-1' : '0');

        // Calculate visible step number
        const visibleIndex = visibleSteps.findIndex(s => s.id === step.id);
        const stepNumber = visibleIndex >= 0 ? visibleIndex + 1 : index + 1;

        stepEl.setAttribute('aria-label', `Step ${stepNumber}: ${step.shortLabel}${isSkipped ? ' (skipped)' : ''}`);

        if (index <= state.currentStep && !isSkipped) {
            const handleClick = () => goToStep(index);
            stepEl.addEventListener('click', handleClick);
            stepEl.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleClick();
                }
            });
        }

        const icon = document.createElement('div');
        icon.className = 'wizard-step__icon';
        icon.textContent = status === 'completed' ? '✓' : stepNumber;

        const label = document.createElement('div');
        label.className = 'wizard-step__label';
        label.textContent = step.shortLabel;

        stepEl.appendChild(icon);
        stepEl.appendChild(label);
        fragment.appendChild(stepEl);
    });

    container.appendChild(fragment);
}

function renderButtons() {
    const backBtn = DOM.backButton;
    const nextBtn = DOM.nextButton;

    backBtn.disabled = state.currentStep === 0;

    if (state.currentStep === steps.length - 1) {
        nextBtn.textContent = 'Finish';
        nextBtn.disabled = true;
    } else {
        nextBtn.innerHTML = 'Next <span aria-hidden="true">→</span>';
        nextBtn.disabled = false;
    }
}

function updateNavigationButtons() {
    renderButtons();
}

function updateStepIndicator() {
    const container = DOM.stepIndicator;
    const stepElements = container.querySelectorAll('.wizard-step');
    const visibleSteps = getVisibleSteps();

    stepElements.forEach((stepEl, index) => {
        const step = steps[index];
        const status = getStepStatus(index);
        const isSkipped = !step.shouldShow();

        stepEl.className = `wizard-step wizard-step--${status}`;
        if (isSkipped) {
            stepEl.classList.add('wizard-step--skipped');
        }

        const icon = stepEl.querySelector('.wizard-step__icon');
        if (icon) {
            // Calculate visible step number
            const visibleIndex = visibleSteps.findIndex(s => s.id === step.id);
            const stepNumber = visibleIndex >= 0 ? visibleIndex + 1 : index + 1;
            icon.textContent = status === 'completed' ? '✓' : String(stepNumber);
        }
    });
}

function updateChecklistItemState(taskId, checked) {
    const checklistItem = document.querySelector(`.checklist-item[data-task-id="${taskId}"]`);
    if (checklistItem) {
        if (checked) {
            checklistItem.classList.add('completed');
        } else {
            checklistItem.classList.remove('completed');
        }
    }
}

function renderCurrentStep() {
    const container = DOM.wizardContent;
    container.innerHTML = '';

    const currentStep = steps[state.currentStep];
    const stepContent = document.createElement('div');
    stepContent.className = 'step-content active';

    renderStepTemplate(currentStep, stepContent);
    container.appendChild(stepContent);
}

async function renderStepTemplate(step, container) {
    try {
        const visibleSteps = getVisibleSteps();
        const templateData = {
            userPath_new: state.userPath === 'new',
            userPath_existing: state.userPath === 'existing',
            tasks: state.tasks,
            totalSteps: visibleSteps.length - 2,
            completedTasks: Object.values(state.tasks).filter(Boolean).length
        };

        const html = await templateEngine.loadAndRender(step.template, templateData);
        container.innerHTML = html;
        attachStepEventListeners(step.id, container);
    } catch (error) {
        console.error('Error rendering step template:', error);
        container.innerHTML = '<p>Error loading step content. Please refresh the page.</p>';
    }
}

function updateUI() {
    renderStepIndicator();
    renderCurrentStep();
    renderButtons();
}

function attachStepEventListeners(stepId, container) {
    switch (stepId) {
        case 'welcome':
            attachWelcomeListeners(container);
            break;
        case 'account':
        case 'attribution':
        case 'userpage':
        case 'upload':
            attachChecklistListeners(container);
            break;
    }
}

function attachWelcomeListeners(container) {
    const pathNew = container.querySelector('#pathNew');
    const pathExisting = container.querySelector('#pathExisting');

    if (!pathNew || !pathExisting) return;

    const selectPath = (path) => {
        state.userPath = path;

        if (path === 'existing') {
            state.tasks.account_created = true;
            state.tasks.email_verified = true;
        } else {
            state.tasks.account_created = false;
            state.tasks.email_verified = false;
        }

        pathNew.classList.toggle('selected', path === 'new');
        pathNew.setAttribute('aria-pressed', String(path === 'new'));
        pathExisting.classList.toggle('selected', path === 'existing');
        pathExisting.setAttribute('aria-pressed', String(path === 'existing'));

        saveState();
        requestAnimationFrame(() => {
            updateNavigationButtons();
        });
    };

    const handleKeyPress = (e, path) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            selectPath(path);
        }
    };

    pathNew.addEventListener('click', () => selectPath('new'));
    pathNew.addEventListener('keypress', (e) => handleKeyPress(e, 'new'));

    pathExisting.addEventListener('click', () => selectPath('existing'));
    pathExisting.addEventListener('keypress', (e) => handleKeyPress(e, 'existing'));
}

function attachChecklistListeners(container) {
    const checkboxes = container.querySelectorAll('.checklist-item input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            const taskId = e.target.id;
            setTask(taskId, e.target.checked);
        });
    });
}

function cacheDOMElements() {
    DOM.stepIndicator = document.getElementById('stepIndicator');
    DOM.wizardContent = document.getElementById('wizardContent');
    DOM.backButton = document.getElementById('backButton');
    DOM.nextButton = document.getElementById('nextButton');
    DOM.resetButton = document.getElementById('resetButton');
}

function setupEventListeners() {
    DOM.backButton.addEventListener('click', prevStep);
    DOM.nextButton.addEventListener('click', nextStep);
    DOM.resetButton.addEventListener('click', resetState);

    document.addEventListener('keydown', (e) => {
        if (e.altKey) {
            if (e.key === 'ArrowRight') {
                e.preventDefault();
                nextStep();
            } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                prevStep();
            }
        }
    });
}

function init() {
    cacheDOMElements();
    loadState();
    updateUI();
    setupEventListeners();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
