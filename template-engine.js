// Takes shared components in the shared/components/ directory
// and loads them into the document where indicated by
// data-component attributes, or through direct calls to loadComponents().

class TemplateEngine {
    constructor() {
        this.templateCache = {};
        this.basePath = '';
    }

    setBasePath(path) {
        this.basePath = path;
    }

    async loadTemplate(templateName, directory = 'templates') {
        const cacheKey = `${directory}/${templateName}`;

        if (this.templateCache[cacheKey]) {
            return this.templateCache[cacheKey];
        }

        try {
            const response = await fetch(`${this.basePath}${directory}/${templateName}.html`);
            if (!response.ok) {
                throw new Error(`Failed to load template: ${templateName} from ${directory}`);
            }
            const template = await response.text();
            this.templateCache[cacheKey] = template;
            return template;
        } catch (error) {
            console.error('Template loading error:', error);
            throw error;
        }
    }

    render(template, data = {}) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(template, 'text/html');

        this.processConditionals(doc, data);
        this.processVariables(doc, data);
        this.processChecklistItems(doc, data);

        return doc.body.innerHTML;
    }

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

    processChecklistItems(doc, data) {
        const checklistItems = doc.querySelectorAll('[data-checklist-item]');
        checklistItems.forEach(element => {
            const taskId = element.getAttribute('data-task-id');
            const label = element.getAttribute('data-label');
            const required = element.getAttribute('data-required') === 'true';

            if (!taskId || !label) {
                console.error('Checklist item missing required attributes:', element);
                return;
            }

            const isChecked = data.tasks && data.tasks[taskId];

            element.className = `checklist-item ${isChecked ? 'completed' : ''}`;
            element.setAttribute('data-task-id', taskId);

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = taskId;
            checkbox.setAttribute('aria-describedby', `${taskId}-label`);
            if (isChecked) {
                checkbox.setAttribute('checked', 'checked');
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

            element.textContent = '';
            element.appendChild(checkbox);
            element.appendChild(labelElement);

            element.removeAttribute('data-checklist-item');
            element.removeAttribute('data-label');
            element.removeAttribute('data-required');
        });
    }

    async loadAndRender(templateName, data = {}, directory = 'templates') {
        const template = await this.loadTemplate(templateName, directory);
        return this.render(template, data);
    }

    async loadComponents() {
        const components = document.querySelectorAll('[data-component]');
        const promises = Array.from(components).map(async (element) => {
            const componentName = element.getAttribute('data-component');
            const directory = element.getAttribute('data-component-dir') || 'shared/components';

            try {
                const savedBasePath = this.basePath;
                this.basePath = '';
                const html = await this.loadTemplate(componentName, directory);
                this.basePath = savedBasePath;

                element.innerHTML = html;
                element.removeAttribute('data-component');
                element.removeAttribute('data-component-dir');
            } catch (error) {
                console.error(`Failed to load component: ${componentName}`, error);
            }
        });

        await Promise.all(promises);
    }
}

if (!window.templateEngine) {
    window.templateEngine = new TemplateEngine();
}
