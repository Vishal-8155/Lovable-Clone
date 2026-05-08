# AppForge

AppForge is a React + Vite app for generating and previewing React + Tailwind app code.

## Local Development

```powershell
npm install
npm run dev
```

## Deploy To Vercel

1. Push this project to a GitHub repository.
2. Open Vercel and choose **Add New > Project**.
3. Import the GitHub repository.
4. Use the **Vite** framework preset.
5. Use `npm run build` as the build command.
6. Use `dist` as the output directory.
7. Deploy.

The app is now a standard React + Vite project. Vercel builds it into `dist`.

## API Keys

API keys are not committed to the repository. Add them in the app's Settings modal after opening the deployed site.

If real keys were ever committed before, rotate those keys in the provider dashboards before publishing the repository.
