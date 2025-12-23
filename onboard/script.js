const STORAGE_KEY = 'wikiportraits_onboard_state';
const DOM = {};

const getInitialState = () => ({
    currentStep: 0,
    userPath: null,
    tasks: {}
});

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

let state = getInitialState();

const saveState = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
};

const loadState = () => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        try {
            state = JSON.parse(saved);
        } catch (e) {
            console.error('Failed to load saved state:', e);
            state = getInitialState();
        }
    }
};

const resetState = () => {
    if (confirm('Are you sure you want to start over? All progress will be lost.')) {
        localStorage.removeItem(STORAGE_KEY);
        state = getInitialState();
        init();
    }
};

const setTask = (taskId, value) => {
    state.tasks[taskId] = value;
    saveState();

    requestAnimationFrame(() => {
        updateStepIndicator();
        updateNavigationButtons();
        updateChecklistItemState(taskId, value);
    });
};

const getTask = (taskId) => state.tasks[taskId] || false;

const isStepComplete = (stepId) => {
    const step = steps.find(s => s.id === stepId);
    if (!step || !step.requiredTasks) return true;
    return step.requiredTasks.every(taskId => getTask(taskId));
};

const getStepStatus = (stepIndex) => {
    if (stepIndex < state.currentStep) {
        return isStepComplete(steps[stepIndex].id) ? 'completed' : 'visited';
    }
    return stepIndex === state.currentStep ? 'active' : 'pending';
};

const getVisibleSteps = () => steps.filter(step => step.shouldShow());

const findNextVisibleStep = (fromIndex, direction = 1) => {
    let index = fromIndex + direction;
    while (index >= 0 && index < steps.length && !steps[index].shouldShow()) {
        index += direction;
    }
    return index >= 0 && index < steps.length ? index : null;
};

const goToStep = (index) => {
    if (index < 0 || index >= steps.length || !steps[index].shouldShow()) return;
    state.currentStep = index;
    saveState();
    updateUI();
};

const nextStep = () => {
    const currentStep = steps[state.currentStep];

    if (!currentStep.canProceed()) {
        const proceed = confirm('Some recommended tasks are not completed. Do you want to continue anyway?');
        if (!proceed) return;
    }

    const nextIndex = findNextVisibleStep(state.currentStep);
    if (nextIndex !== null) {
        goToStep(nextIndex);
    }
};

const prevStep = () => {
    const prevIndex = findNextVisibleStep(state.currentStep, -1);
    if (prevIndex !== null) {
        goToStep(prevIndex);
    }
};

const createStepElement = (step, index, visibleSteps) => {
    const stepEl = document.createElement('div');
    const status = getStepStatus(index);
    const isSkipped = !step.shouldShow();
    const visibleIndex = visibleSteps.findIndex(s => s.id === step.id);
    const stepNumber = visibleIndex >= 0 ? visibleIndex + 1 : index + 1;

    stepEl.className = `onboard-step onboard-step--${status}`;
    stepEl.classList.toggle('onboard-step--skipped', isSkipped);
    stepEl.setAttribute('role', 'button');
    stepEl.setAttribute('tabindex', isSkipped ? '-1' : '0');
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
    icon.className = 'onboard-step__icon';
    icon.textContent = status === 'completed' ? '✓' : stepNumber;

    const label = document.createElement('div');
    label.className = 'onboard-step__label';
    label.textContent = step.shortLabel;

    stepEl.appendChild(icon);
    stepEl.appendChild(label);
    return stepEl;
};

const renderStepIndicator = () => {
    const container = DOM.stepIndicator;
    container.innerHTML = '';

    const fragment = document.createDocumentFragment();
    const visibleSteps = getVisibleSteps();

    steps.forEach((step, index) => {
        fragment.appendChild(createStepElement(step, index, visibleSteps));
    });

    container.appendChild(fragment);
};

const updateNavigationButtons = () => {
    DOM.backButton.disabled = state.currentStep === 0;

    if (state.currentStep === steps.length - 1) {
        DOM.nextButton.textContent = 'Finish';
        DOM.nextButton.disabled = true;
    } else {
        DOM.nextButton.innerHTML = 'Next <span aria-hidden="true">→</span>';
        DOM.nextButton.disabled = false;
    }
};

const updateStepIndicator = () => {
    const container = DOM.stepIndicator;
    const stepElements = container.querySelectorAll('.onboard-step');
    const visibleSteps = getVisibleSteps();

    stepElements.forEach((stepEl, index) => {
        const step = steps[index];
        const status = getStepStatus(index);
        const isSkipped = !step.shouldShow();
        const visibleIndex = visibleSteps.findIndex(s => s.id === step.id);
        const stepNumber = visibleIndex >= 0 ? visibleIndex + 1 : index + 1;

        stepEl.className = `onboard-step onboard-step--${status}`;
        stepEl.classList.toggle('onboard-step--skipped', isSkipped);

        const icon = stepEl.querySelector('.onboard-step__icon');
        if (icon) {
            icon.textContent = status === 'completed' ? '✓' : stepNumber;
        }
    });
};

const updateChecklistItemState = (taskId, checked) => {
    const checklistItem = document.querySelector(`.checklist-item[data-task-id="${taskId}"]`);
    if (checklistItem) {
        checklistItem.classList.toggle('completed', checked);
    }
};

const renderCurrentStep = async () => {
    const container = DOM.onboardContent;
    container.innerHTML = '';

    const currentStep = steps[state.currentStep];
    const stepContent = document.createElement('div');
    stepContent.className = 'step-content active';

    await renderStepTemplate(currentStep, stepContent);
    container.appendChild(stepContent);
};

const renderStepTemplate = async (step, container) => {
    try {
        const visibleSteps = getVisibleSteps();
        const templateData = {
            userPath_new: state.userPath === 'new',
            userPath_existing: state.userPath === 'existing',
            tasks: state.tasks,
            totalSteps: visibleSteps.length - 2,
            completedTasks: Object.values(state.tasks).filter(Boolean).length
        };

        const html = await templateEngine.loadAndRender(step.template, templateData, 'templates');
        container.innerHTML = html;
        attachStepEventListeners(step.id, container);
    } catch (error) {
        console.error('Error rendering step template:', error);
        container.innerHTML = '<p>Error loading step content. Please refresh the page.</p>';
    }
};

const updateUI = async () => {
    renderStepIndicator();
    await renderCurrentStep();
    updateNavigationButtons();
};

const attachStepEventListeners = (stepId, container) => {
    if (stepId === 'welcome') {
        attachWelcomeListeners(container);
    } else if (['account', 'attribution', 'userpage', 'upload'].includes(stepId)) {
        attachChecklistListeners(container);
    }
};

const attachWelcomeListeners = (container) => {
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
};

const attachChecklistListeners = (container) => {
    const checkboxes = container.querySelectorAll('.checklist-item input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            const taskId = e.target.id;
            setTask(taskId, e.target.checked);
        });
    });
};

const cacheDOMElements = () => {
    DOM.stepIndicator = document.getElementById('stepIndicator');
    DOM.onboardContent = document.getElementById('onboardContent');
    DOM.backButton = document.getElementById('backButton');
    DOM.nextButton = document.getElementById('nextButton');
    DOM.resetButton = document.getElementById('resetButton');
};

const setupEventListeners = () => {
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
};

const init = () => {
    cacheDOMElements();
    loadState();
    updateUI();
    setupEventListeners();
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
