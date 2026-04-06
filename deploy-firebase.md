# Firebase Deployment Steps

## Current Configuration:
- **Firebase CLI**: ✅ Installed (v15.1.0)
- **Logged in as**: nanidesmond01@gmail.com
- **Configured project in .firebaserc**: mhealth-6191e
- **Project in firebase.ts**: lawhub-393ad

**Note**: You have a project ID mismatch. Make sure you use the correct project.

## Deployment Steps:

### Step 1: Verify/Set Firebase Project
If you need to change the project, run:
```bash
firebase use lawhub-393ad
```
Or keep using:
```bash
firebase use mhealth-6191e
```

### Step 2: Build Your Application
```bash
npm run build
```

### Step 3: Deploy to Firebase Hosting
```bash
firebase deploy --only hosting
```

### Step 4: Access Your Site
After deployment, you'll get a URL like:
- `https://your-project-id.web.app`
- `https://your-project-id.firebaseapp.com`

## Next Steps:
Run the commands above in order!




