# WikiPortraits Onboarding Wizard

A onboarding wizard for new WikiPortraits participants.

## Structure

- `index.html` - Main HTML file
- `styles.css` - Main CSS stylesheet
- `template-engine.js` - Simple custom templating engine
- `script.js` - Main application logic
- `templates/` - HTML templates for each step
- `img/` - Images (logo, etc.)

## Adding a New Step

1. Create a new template file in `templates/`:
   ```html
   <!-- templates/my-step.html -->
   <h2 class="step-title">My Step Title</h2>
   <div class="step-description">
       <p>Description text</p>
   </div>
   ```

2. Add the step to `script.js`:
   ```javascript
   {
       id: 'my-step',
       title: 'My Step Title',
       shortLabel: 'My Step',
       template: 'my-step',
       requiredTasks: ['task1', 'task2'],
       shouldShow: () => true,
       canProceed: () => isStepComplete('my-step')
   }
   ```

3. If your step has interactive elements, add event listeners in `attachStepEventListeners()`:
   ```javascript
   case 'my-step':
       attachMyStepListeners(container);
       break;
   ```

## Development

While this project is simply static HTML and JavaScript, viewing locally still requires spinning up an HTTP server.

```bash
# Python 3
python3 -m http.server 8000
```

Open `http://localhost:8000` in your browser.