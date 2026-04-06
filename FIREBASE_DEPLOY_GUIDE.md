# 🔥 Firebase Hosting Deployment Guide

Follow these steps to deploy your app to Firebase Hosting:

## Step 1: Re-authenticate with Firebase

Open your terminal/PowerShell in the project directory and run:

```bash
firebase login
```

This will open your browser to log in. Make sure you're logged in as `nanidesmond01@gmail.com` (or the correct account).

## Step 2: Verify Your Firebase Project

Check which project you're using:
```bash
firebase use
```

If you need to switch projects:
```bash
firebase use lawhub-393ad
```
OR
```bash
firebase use mhealth-6191e
```

**Important**: Make sure the project ID matches what's in your `src/firebase.ts` file!

## Step 3: Enable Firebase Hosting (if not already enabled)

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Click on "Hosting" in the left sidebar
4. Click "Get started" if hosting isn't enabled yet

## Step 4: Build Your Application

```bash
npm run build
```

This creates the `dist` folder with production files.

## Step 5: Initialize Hosting (if needed)

If hosting wasn't initialized, run:
```bash
firebase init hosting
```

When prompted:
- **What do you want to use as your public directory?** → Type: `dist`
- **Configure as a single-page app?** → Type: `Yes`
- **Set up automatic builds and deploys with GitHub?** → Type: `No` (unless you want CI/CD)
- **File dist/index.html already exists. Overwrite?** → Type: `No`

## Step 6: Deploy to Firebase Hosting

```bash
firebase deploy --only hosting
```

## Step 7: Access Your Live Site! 🎉

After successful deployment, you'll see output like:
```
✔ Deploy complete!

Hosting URL: https://your-project-id.web.app
Hosting URL: https://your-project-id.firebaseapp.com
```

Visit the URL to see your live site!

---

## Troubleshooting

### Error: "resolving hosting target of a site with no site name"
**Solution**: Make sure Firebase Hosting is enabled in the Firebase Console first (Step 3).

### Error: "401 Authentication credentials"
**Solution**: Run `firebase login` again (Step 1).

### Project ID Mismatch
If your `.firebaserc` shows a different project than `firebase.ts`:
- Either update `.firebaserc` to match your Firebase config
- Or update `src/firebase.ts` to use the project in `.firebaserc`
- Or run `firebase use <correct-project-id>`

### Multiple Sites
If you have multiple hosting sites, you may need to specify the site:
```bash
firebase deploy --only hosting:your-site-id
```

---

## Quick Deploy Script

Once everything is set up, you can create a simple deploy script. Add this to your `package.json`:

```json
{
  "scripts": {
    "deploy": "npm run build && firebase deploy --only hosting"
  }
}
```

Then just run:
```bash
npm run deploy
```

---

## Updating Your Site

To update your site after making changes:
1. Make your code changes
2. Run `npm run build`
3. Run `firebase deploy --only hosting`

---

**Need help?** Check the [Firebase Hosting Documentation](https://firebase.google.com/docs/hosting)




