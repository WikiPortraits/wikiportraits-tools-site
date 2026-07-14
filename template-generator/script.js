(() => {
    'use strict';

    // Constants
    const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/;
    const PARENT_CATEGORIES_SELECTOR = 'input[name="parentCategories"]:checked';
    const COMMONS_BASE_URL = 'https://commons.wikimedia.org/wiki';
    const COMMONS_API_URL = 'https://commons.wikimedia.org/w/api.php';
    const COPY_SUCCESS_DURATION = 2000;

    // DOM elements
    const DOM = {
        form: document.getElementById('templateForm'),
        submitBtn: document.querySelector('#templateForm [type="submit"]'),
        eventName: document.getElementById('eventName'),
        eventAbbreviation: document.getElementById('eventAbbreviation'),
        eventYear: document.getElementById('eventYear'),
        wikiArticle: document.getElementById('wikiArticle'),
        eventCountry: document.getElementById('eventCountry'),
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
        templateExample: document.getElementById('templateExample'),
        templateExistsWarning: document.getElementById('templateExistsWarning'),
        categoryExistsWarning: document.getElementById('categoryExistsWarning')
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
        eventCountry: DOM.eventCountry.value.trim(),
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

    // Prefix "the" for certain countries in category names
    const COUNTRIES_TAKING_THE = new Set([
        'Bahamas',
        'British Indian Ocean Territory',
        'British Virgin Islands',
        'Cayman Islands',
        'Central African Republic',
        'Cocos (Keeling) Islands',
        'Comoros',
        'Congo',
        'Cook Islands',
        'Czech Republic',
        'Democratic Republic of the Congo',
        'Dominican Republic',
        'Falkland Islands',
        'Faroe Islands',
        'Federated States of Micronesia',
        'Gambia',
        'Isle of Man',
        'Maldives',
        'Marshall Islands',
        'Netherlands',
        'Netherlands Antilles',
        'Northern Mariana Islands',
        'Philippines',
        'Pitcairn Islands',
        'Russian Federation',
        'Solomon Islands',
        'Turks and Caicos Islands',
        'United Arab Emirates',
        'United Kingdom',
        'United States',
        'United States Minor Outlying Islands',
        'United States Virgin Islands'
    ]);

    const countryCategoryName = country =>
        COUNTRIES_TAKING_THE.has(country) ? `the ${country}` : country;

    const generateCategoryCode = (templateName, selectedCategories, year, country) => {
        const parentCategoryLinks = selectedCategories.map(cat => `[[Category:${cat}]]`).join('\n');
        const countryLink = country ? `\n[[Category:WikiPortraits in ${countryCategoryName(country)}]]` : '';
        return `{{Hiddencat}}
{{${templateName}}}
${parentCategoryLinks}
[[Category:WikiPortraits in ${year}]]${countryLink}`;
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

    // Existence check against Wikimedia Commons API
    const checkCommonsPages = async (templateName, categoryName) => {
        const params = new URLSearchParams({
            action: 'query',
            titles: `Template:${templateName}|Category:${categoryName}`,
            prop: 'revisions',
            rvprop: 'content',
            rvslots: 'main',
            format: 'json',
            origin: '*'
        });

        try {
            const response = await fetch(`${COMMONS_API_URL}?${params}`);
            if (!response.ok) return null;
            const data = await response.json();
            const pages = data.query.pages;

            const result = { template: null, category: null };
            for (const pageId of Object.keys(pages)) {
                const page = pages[pageId];
                if (pageId === '-1' || 'missing' in page) continue;

                const content = page.revisions?.[0]?.slots?.main?.['*']
                    ?? page.revisions?.[0]?.['*']
                    ?? '';
                const pageUrl = `${COMMONS_BASE_URL}/${page.title.replace(/ /g, '_')}`;

                if (page.title.startsWith('Template:')) {
                    result.template = { url: pageUrl, content };
                } else if (page.title.startsWith('Category:')) {
                    result.category = { url: pageUrl, content };
                }
            }
            return result;
        } catch {
            return null;
        }
    };

    const showExistenceWarning = (warningEl, info, typeName, pageName, eventName) => {
        if (!info) {
            warningEl.style.display = 'none';
            return;
        }

        const sameEvent = info.content.toLowerCase().includes(eventName.toLowerCase());
        warningEl.className = 'existence-warning';

        if (sameEvent) {
            warningEl.innerHTML = `<strong>&#9888;&#65039; ${typeName.charAt(0).toUpperCase() + typeName.slice(1)} "${pageName}" already exists on Wikimedia Commons</strong> and appears to be for the same event. No need to create it again. <a href="${info.url}" target="_blank" rel="noopener">View existing ${typeName} &rarr;</a>`;
        } else {
            warningEl.innerHTML = `<strong>&#9888;&#65039; ${typeName.charAt(0).toUpperCase() + typeName.slice(1)} "${pageName}" already exists on Wikimedia Commons</strong>, possibly for a different event (e.g., a conflicting abbreviation). If this is a conflict, scroll up and adjust the event name or abbreviation before creating. <a href="${info.url}" target="_blank" rel="noopener">View existing ${typeName} &rarr;</a>`;
        }

        warningEl.style.display = 'block';
    };

    // Form submission
    DOM.form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const selectedCategories = getSelectedCategories();
        if (selectedCategories.length === 0) {
            alert('Please select at least one event type.');
            return;
        }

        await generateTemplates();
    });

    const generateTemplates = async () => {
        const { eventName, eventAbbreviation, eventYear, wikiArticle, eventCountry, accentColor, selectedCategories } = getFormData();

        const templateName = generateTemplateName(eventName, eventAbbreviation, eventYear);
        const categoryName = generateCategoryName(eventName, eventYear);
        const title = generateTitle(wikiArticle, eventName, eventYear);
        const templateCode = generateTemplateCode(title, categoryName, accentColor);
        const categoryCode = generateCategoryCode(templateName, selectedCategories, eventYear, eventCountry);

        // Display results
        DOM.templateName.textContent = `Template:${templateName}`;
        DOM.templateCode.textContent = templateCode;
        DOM.categoryName.textContent = `Category:${categoryName}`;
        DOM.categoryCode.textContent = categoryCode;
        DOM.templateExample.textContent = `{{${templateName}}}`;

        // Generate Commons create links
        DOM.createTemplateLink.href = createCommonsUrl('Template', templateName);
        DOM.createCategoryLink.href = createCommonsUrl('Category', categoryName);

        // Show output section before the async check so results are visible immediately
        DOM.outputSection.style.display = 'block';
        DOM.outputSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

        // Clear any previous warnings and show loading state
        DOM.templateExistsWarning.style.display = 'none';
        DOM.categoryExistsWarning.style.display = 'none';
        DOM.submitBtn.textContent = 'Checking Commons…';
        DOM.submitBtn.disabled = true;

        const existence = await checkCommonsPages(templateName, categoryName);

        DOM.submitBtn.textContent = 'Generate Template + Category Syntax';
        DOM.submitBtn.disabled = false;

        if (existence) {
            showExistenceWarning(DOM.templateExistsWarning, existence.template, 'template', templateName, eventName);
            showExistenceWarning(DOM.categoryExistsWarning, existence.category, 'category', categoryName, eventName);
        }
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
