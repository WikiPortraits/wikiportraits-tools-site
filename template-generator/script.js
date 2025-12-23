(() => {
    'use strict';

    // Constants
    const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/;
    const PARENT_CATEGORIES_SELECTOR = 'input[name="parentCategories"]:checked';
    const COMMONS_BASE_URL = 'https://commons.wikimedia.org/wiki';
    const COPY_SUCCESS_DURATION = 2000;

    // DOM elements
    const DOM = {
        form: document.getElementById('templateForm'),
        eventName: document.getElementById('eventName'),
        eventAbbreviation: document.getElementById('eventAbbreviation'),
        eventYear: document.getElementById('eventYear'),
        wikiArticle: document.getElementById('wikiArticle'),
        accentColor: document.getElementById('accentColor'),
        accentColorText: document.getElementById('accentColorText'),
        outputSection: document.getElementById('outputSection'),
        templateName: document.getElementById('templateName'),
        templateCode: document.getElementById('templateCode'),
        categoryName: document.getElementById('categoryName'),
        categoryCode: document.getElementById('categoryCode'),
        copyTemplate: document.getElementById('copyTemplate'),
        copyCategory: document.getElementById('copyCategory'),
        createTemplateLink: document.getElementById('createTemplateLink'),
        createCategoryLink: document.getElementById('createCategoryLink'),
        templateExample: document.getElementById('templateExample')
    };

    // Initialize year
    const currentYear = new Date().getFullYear();
    DOM.eventYear.value = currentYear;
    DOM.eventYear.max = currentYear;

    // Helper functions
    const getSelectedCategories = () =>
        Array.from(document.querySelectorAll(PARENT_CATEGORIES_SELECTOR))
            .map(checkbox => checkbox.value);

    const getFormData = () => ({
        eventName: DOM.eventName.value.trim(),
        eventAbbreviation: DOM.eventAbbreviation.value.trim(),
        eventYear: DOM.eventYear.value.trim(),
        wikiArticle: DOM.wikiArticle.value.trim(),
        accentColor: DOM.accentColorText.value.trim(),
        selectedCategories: getSelectedCategories()
    });

    const generateTemplateName = (name, abbreviation, year) =>
        abbreviation
            ? `WikiPortraits ${abbreviation} ${year}`
            : `WikiPortraits ${name} ${year}`;

    const generateCategoryName = (name, year) =>
        `WikiPortraits at ${year} ${name}`;

    const generateTitle = (wikiArticle, eventName, year) =>
        wikiArticle
            ? `[[:en:${wikiArticle}|${eventName} ${year}]]`
            : `${eventName} ${year}`;

    const generateTemplateCode = (title, categoryName, accentColor) =>
        `{{WikiPortraits
|title = ${title}
|photocat = ${categoryName}
|accent = ${accentColor}
}}<includeonly>{{#ifeq: {{NAMESPACENUMBER}} | 6 | [[Category:${categoryName}]]}}</includeonly><noinclude>{{Documentation}}</noinclude>`;

    const generateCategoryCode = (templateName, selectedCategories, year) => {
        const parentCategoryLinks = selectedCategories.map(cat => `[[Category:${cat}]]`).join('\n');
        return `{{Hiddencat}}
{{${templateName}}}
${parentCategoryLinks}
[[Category:WikiPortraits in ${year}]]`;
    };

    const createCommonsUrl = (type, name) =>
        `${COMMONS_BASE_URL}/${type}:${encodeURIComponent(name)}?action=edit`;

    const copyToClipboard = async (text, button) => {
        try {
            await navigator.clipboard.writeText(text);
            const originalText = button.textContent;
            button.textContent = '✓ Copied!';
            button.style.background = 'var(--success)';

            setTimeout(() => {
                button.textContent = originalText;
                button.style.background = '';
            }, COPY_SUCCESS_DURATION);
        } catch (err) {
            console.error('Failed to copy:', err);
            alert('Failed to copy to clipboard. Please copy manually.');
        }
    };

    // Color sync
    DOM.accentColor.addEventListener('input', () => {
        DOM.accentColorText.value = DOM.accentColor.value;
    });

    DOM.accentColorText.addEventListener('input', () => {
        if (HEX_COLOR_REGEX.test(DOM.accentColorText.value)) {
            DOM.accentColor.value = DOM.accentColorText.value;
        }
    });

    // Form submission
    DOM.form.addEventListener('submit', (e) => {
        e.preventDefault();

        const selectedCategories = getSelectedCategories();
        if (selectedCategories.length === 0) {
            alert('Please select at least one event type.');
            return;
        }

        generateTemplates();
    });

    const generateTemplates = () => {
        const { eventName, eventAbbreviation, eventYear, wikiArticle, accentColor, selectedCategories } = getFormData();

        const templateName = generateTemplateName(eventName, eventAbbreviation, eventYear);
        const categoryName = generateCategoryName(eventName, eventYear);
        const title = generateTitle(wikiArticle, eventName, eventYear);
        const templateCode = generateTemplateCode(title, categoryName, accentColor);
        const categoryCode = generateCategoryCode(templateName, selectedCategories, eventYear);

        // Display results
        DOM.templateName.textContent = `Template:${templateName}`;
        DOM.templateCode.textContent = templateCode;
        DOM.categoryName.textContent = `Category:${categoryName}`;
        DOM.categoryCode.textContent = categoryCode;
        DOM.templateExample.textContent = `{{${templateName}}}`;

        // Generate Commons create links
        DOM.createTemplateLink.href = createCommonsUrl('Template', templateName);
        DOM.createCategoryLink.href = createCommonsUrl('Category', categoryName);

        // Show output section
        DOM.outputSection.style.display = 'block';
        DOM.outputSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };

    // Copy to clipboard functionality
    DOM.copyTemplate.addEventListener('click', () => {
        copyToClipboard(DOM.templateCode.textContent, DOM.copyTemplate);
    });

    DOM.copyCategory.addEventListener('click', () => {
        copyToClipboard(DOM.categoryCode.textContent, DOM.copyCategory);
    });

    // Reset form handler
    DOM.form.addEventListener('reset', () => {
        setTimeout(() => {
            DOM.outputSection.style.display = 'none';
            DOM.accentColorText.value = DOM.accentColor.value;
        }, 0);
    });
})();
