# Deployment Guide for Lawhubb Admin Panel

This guide covers multiple deployment options for your React + Vite application.

## Prerequisites

1. Build your application:
   ```bash
   npm run build
   ```
   This creates a `dist` folder with your production-ready files.

---

## Option 1: Firebase Hosting (Recommended)

Since you're already using Firebase, this is the easiest option.

### Steps:

1. **Install Firebase CLI** (if not already installed):
   ```bash
   npm install -g firebase-tools
   ```

2. **Login to Firebase**:
   ```bash
   firebase login
   ```

3. **Initialize Firebase Hosting** (if not already done):
   ```bash
   firebase init hosting
   ```
   - Select your Firebase project
   - Set public directory to: `dist`
   - Configure as single-page app: `Yes`
   - Set up automatic builds: `No` (we'll do it manually)

4. **Build and Deploy**:
   ```bash
   npm run build
   firebase deploy --only hosting
   ```

5. **Your site will be live at**: `https://your-project-id.web.app` or `https://your-project-id.firebaseapp.com`

### Auto-deploy on Git Push:

Add this to your `firebase.json` under hosting:
```json
"hosting": {
  "public": "dist",
  "predeploy": ["npm run build"],
  ...
}
```

Then deploy:
```bash
firebase deploy
```

---

## Option 2: Vercel (Very Easy)

Vercel is excellent for React apps with zero configuration.

### Steps:

1. **Install Vercel CLI**:
   ```bash
   npm install -g vercel
   ```

2. **Deploy**:
   ```bash
   vercel
   ```
   - Follow the prompts
   - It will auto-detect your Vite setup
   - First deployment will ask for configuration

3. **Or use Vercel Dashboard**:
   - Go to [vercel.com](https://vercel.com)
   - Sign up/login with GitHub
   - Click "New Project"
   - Import your repository
   - Vercel will auto-detect and deploy

### Configuration:

Create `vercel.json` in your root (optional):
```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "devCommand": "npm run dev",
  "installCommand": "npm install"
}
```

---

## Option 3: Netlify

Another popular choice for React apps.

### Steps:

1. **Install Netlify CLI**:
   ```bash
   npm install -g netlify-cli
   ```

2. **Build your app**:
   ```bash
   npm run build
   ```

3. **Deploy**:
   ```bash
   netlify deploy --prod --dir=dist
   ```

4. **Or use Netlify Dashboard**:
   - Go to [netlify.com](https://netlify.com)
   - Sign up/login
   - Drag and drop your `dist` folder, or
   - Connect to Git for continuous deployment

### Configuration:

Create `netlify.toml` in your root:
```toml
[build]
  command = "npm run build"
  publish = "dist"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

---

## Option 4: GitHub Pages

Free hosting with GitHub.

### Steps:

1. **Install gh-pages package**:
   ```bash
   npm install --save-dev gh-pages
   ```

2. **Update `package.json`**:
   ```json
   {
     "scripts": {
       "predeploy": "npm run build",
       "deploy": "gh-pages -d dist"
     },
     "homepage": "https://yourusername.github.io/lawhubbAdminPanel"
   }
   ```

3. **Deploy**:
   ```bash
   npm run deploy
   ```

4. **Enable GitHub Pages**:
   - Go to repository Settings → Pages
   - Select source: `gh-pages` branch
   - Your site will be at: `https://yourusername.github.io/lawhubbAdminPanel`

---

## Option 5: AWS S3 + CloudFront

For production with custom domain.

### Steps:

1. **Build your app**:
   ```bash
   npm run build
   ```

2. **Upload to S3**:
   - Create an S3 bucket
   - Enable static website hosting
   - Upload `dist` folder contents
   - Set bucket policy for public read access

3. **Configure CloudFront** (optional, for CDN):
   - Create CloudFront distribution
   - Point to S3 bucket
   - Configure custom domain

---

## Environment Variables

If you have environment variables, create `.env.production`:

```env
VITE_API_KEY=your_api_key
VITE_FIREBASE_API_KEY=your_firebase_key
```

**Note**: Only variables prefixed with `VITE_` are exposed in Vite apps.

---

## Important Notes

1. **Firebase Configuration**: Make sure your Firebase config in `src/firebase.ts` has the correct production credentials.

2. **Build Output**: Always run `npm run build` before deploying. The `dist` folder is what gets deployed.

3. **Routing**: Your app uses React Router, so make sure your hosting provider is configured for SPA routing (all routes redirect to `index.html`).

4. **HTTPS**: All these platforms provide HTTPS by default.

5. **Custom Domain**: All platforms support custom domains (some require paid plans).

---

## Quick Deploy Commands Summary

```bash
# Build
npm run build

# Firebase
firebase deploy --only hosting

# Vercel
vercel --prod

# Netlify
netlify deploy --prod --dir=dist
```

---

## Recommended Setup

**For quick deployment**: Use **Vercel** or **Netlify** (connects to Git, auto-deploys on push)

**For Firebase integration**: Use **Firebase Hosting** (seamless with your existing Firebase setup)

**For free static hosting**: Use **GitHub Pages**

Choose based on your needs! 🚀




