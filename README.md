# WikiPortraits Tools

Static tools for WikiPortraits contributors, deployed as a simple site served from this repo.

## Apps

- **Home** (`/index.html`): landing page for tools.
- **Onboarding Wizard** (`/onboard`): multi-step flow to onboard new contributors to Wikimedia Commons.
- **Template Generator** (`/template-generator`): form-flow to help users create new WikiPortraits templates and categories.

Shared UI lives under `shared/` (global styles + reusable components). Images and branding assets are in `img/`.

## Local Development

Everything is static, so any HTTP server works:

```bash
# Python 3
python3 -m http.server 8000
```

Then open `http://localhost:8000`.