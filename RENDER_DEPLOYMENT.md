# Render Deployment Guide

## Quick Start

Your code has been successfully pushed to GitHub and is ready for deployment on Render!

### Step 1: Create a MySQL Database

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click "New" → "Database"
3. Select MySQL
4. Configure:
   - Name: review-module-db
   - Region: Choose closest to you
   - Plan: Free (for testing)
5. Click "Create Database"

### Step 2: Create Web Service

1. In Render Dashboard, click "New" → "Web Service"
2. Connect your GitHub account
3. Select the repository: `ManideekshithEtikala/review-modeule-backend`
4. Configure:
   - Name: review-module-backend
   - Region: Same as your database
   - Branch: main
   - Runtime: Node
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Plan: Free (or upgrade for production)

### Step 3: Configure Environment Variables

In the "Environment" section, add these variables:

| Variable | Value |
|----------|-------|
| `PORT` | 10000 (Render auto-sets this) |
| `DATABASE_URL` | Copy from your database details |
| `DB_SSL` | true |
| `DB_CONNECTION_LIMIT` | 10 |
| `FRONTEND_ORIGIN` | Your frontend URL (or `*` for testing) |

**Note:** Render provides the database connection URL in the format:
```
mysql://username:password@host:port/database_name
```

### Step 4: Deploy

1. Click "Create Web Service"
2. Wait for the build to complete (check logs)
3. Your app will be available at: `https://review-module-backend.onrender.com`

### Step 5: Test Your API

Once deployed, test your endpoints:

```bash
# Test the API
curl https://review-module-backend.onrender.com/api/reviews

# Or use your browser
https://review-module-backend.onrender.com/api/reviews
```

## Database Auto-Setup

The first time you deploy, you may need to create the database tables. You can:

1. Connect to your Render database using a MySQL client
2. Run the schema SQL (see README.md)
3. Or create a setup endpoint in your code

## Auto-Deploy from GitHub

Render automatically deploys when you push to the main branch:

1. Make changes locally
2. Commit and push to GitHub
3. Render automatically rebuilds and redeploys

```bash
git add .
git commit -m "Your changes"
git push origin main
```

## Monitoring

- View logs: Render Dashboard → Your Service → Logs
- Monitor performance: Metrics tab
- Set up alerts: Alerts tab

## Troubleshooting

### Build Fails
- Check Node version in package.json
- Verify all dependencies are in package.json
- Check build logs for errors

### App Crashes
- Verify all environment variables are set
- Check database connection
- Review runtime logs

### Database Connection Issues
- Ensure DB_SSL=true for Render databases
- Verify DATABASE_URL format
- Check database firewall rules

## Next Steps

1. Add authentication (JWT, OAuth)
2. Implement request validation
3. Add rate limiting
4. Set up automated tests
5. Configure custom domain
6. Enable SSL certificate (auto on Render)

## Support

- [Render Documentation](https://render.com/docs)
- [Render Status](https://status.render.com)
- [Community Forums](https://community.render.com)
