class TemplateEngine {
    constructor() {
        this.templateCache = {};
    }

    /**
     * Load a template from a file
     * @param {string} templateName - Name of the template file (without .html extension)
     * @returns {Promise<string>} The template content
     */
    async loadTemplate(templateName) {
        // Check cache first
        if (this.templateCache[templateName]) {
            return this.templateCache[templateName];
        }

        try {
            const response = await fetch(`templates/${templateName}.html`);
            if (!response.ok) {
                throw new Error(`Failed to load template: ${templateName}`);
            }
            const template = await response.text();
            this.templateCache[templateName] = template;
            return template;
        } catch (error) {
            console.error('Template loading error:', error);
            throw error;
        }
    }

    /**
     * Render a template with data
     * @param {string} template - The template string
     * @param {object} data - Data object for interpolation
     * @returns {string} Rendered HTML
     */
    render(template, data = {}) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(template, 'text/html');

        // Process conditional blocks (data-if)
        this.processConditionals(doc, data);

        // Process variable interpolation (data-text, data-value)
        this.processVariables(doc, data);

        // Process checklist items (data-checklist-item)
        this.processChecklistItems(doc, data);

        return doc.body.innerHTML;
    }

    /**
     * Process elements with data-if attribute (remove if condition is false)
     */
    processConditionals(doc, data) {
        const conditionalElements = doc.querySelectorAll('[data-if]');
        conditionalElements.forEach(element => {
            const condition = element.getAttribute('data-if');
            if (!data[condition]) {
                element.remove();
            } else {
                element.removeAttribute('data-if');
            }
        });

        // Process data-class-if (add class if condition is true)
        const classCondElements = doc.querySelectorAll('[data-class-if]');
        classCondElements.forEach(element => {
            const value = element.getAttribute('data-class-if');
            const [condition, className] = value.split(':');
            if (data[condition]) {
                element.classList.add(className);
            }
            element.removeAttribute('data-class-if');
        });
    }

    /**
     * Process elements with data-text attribute
     */
    processVariables(doc, data) {
        const textElements = doc.querySelectorAll('[data-text]');
        textElements.forEach(element => {
            const variable = element.getAttribute('data-text');
            if (data[variable] !== undefined) {
                element.textContent = data[variable];
            }
            element.removeAttribute('data-text');
        });
    }

    /**
     * Process elements with data-checklist-item attribute
     */
    processChecklistItems(doc, data) {
        const checklistItems = doc.querySelectorAll('[data-checklist-item]');
        checklistItems.forEach(element => {
            const taskId = element.getAttribute('data-task-id');
            const label = element.getAttribute('data-label');
            const required = element.getAttribute('data-required') === 'true';

            // Validate required attributes
            if (!taskId || !label) {
                console.error('Checklist item missing required attributes:', element);
                return;
            }

            const isChecked = data.tasks && data.tasks[taskId];

            element.className = `checklist-item ${isChecked ? 'completed' : ''}`;
            element.setAttribute('data-task-id', taskId);

            // Create elements safely without innerHTML
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = taskId;
            checkbox.setAttribute('aria-describedby', `${taskId}-label`);
            if (isChecked) {
                checkbox.checked = true;
            }

            const labelElement = document.createElement('label');
            labelElement.htmlFor = taskId;
            labelElement.id = `${taskId}-label`;
            labelElement.textContent = label + ' ';

            if (required) {
                const requiredSpan = document.createElement('strong');
                requiredSpan.textContent = '(required)';
                labelElement.appendChild(requiredSpan);
            }

            element.textContent = ''; // Clear existing content
            element.appendChild(checkbox);
            element.appendChild(labelElement);

            element.removeAttribute('data-checklist-item');
            element.removeAttribute('data-label');
            element.removeAttribute('data-required');
        });
    }

    /**
     * Load and render a template
     * @param {string} templateName - Name of the template
     * @param {object} data - Data for rendering
     * @returns {Promise<string>} Rendered HTML
     */
    async loadAndRender(templateName, data = {}) {
        const template = await this.loadTemplate(templateName);
        return this.render(template, data);
    }
}

// Export for use in other files
const templateEngine = new TemplateEngine();
