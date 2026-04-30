# Review Module Backend

A Node.js/Express backend service for managing reviews with MySQL database support.

## Features

- RESTful API for review management
- MySQL database integration with connection pooling
- SSL/TLS support for secure database connections
- CORS enabled for frontend integration
- Environment-based configuration

## Prerequisites

- Node.js 18+ or 20+
- MySQL database (or compatible like MariaDB, Aiven, etc.)
- npm or yarn package manager

## Installation

1. Clone the repository:
```bash
git clone https://github.com/ManideekshithEtikala/review-modeule-backend.git
cd review-module-backend
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file for local development:
```env
# Server Configuration
PORT=3000

# Database Configuration (Option 1: Using DATABASE_URL)
DATABASE_URL=mysql://username:password@host:port/database_name
DB_SSL=true
DB_CONNECTION_LIMIT=15

# Database Configuration (Option 2: Using individual variables)
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=password
DB_NAME=reviews_db
DB_SSL=false
DB_CONNECTION_LIMIT=10

# Frontend Configuration
FRONTEND_ORIGIN=http://localhost:3000
```

4. Run the application:
```bash
# Development mode with auto-reload
npm run dev

# Production mode
npm start
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | 3000 |
| `DATABASE_URL` | MySQL connection URL | - |
| `DB_HOST` | Database host | localhost |
| `DB_PORT` | Database port | 3306 |
| `DB_USER` | Database username | - |
| `DB_PASSWORD` | Database password | - |
| `DB_NAME` | Database name | - |
| `DB_SSL` | Enable SSL for DB connection | false |
| `DB_CONNECTION_LIMIT` | Max DB connections | 10 |
| `FRONTEND_ORIGIN` | Allowed frontend origin | http://localhost:3000 |

## API Endpoints

The API provides the following endpoints (see `data.js` for implementation details):

- `GET /api/reviews` - Get all reviews
- `GET /api/reviews/:id` - Get a specific review
- `POST /api/reviews` - Create a new review
- `PUT /api/reviews/:id` - Update a review
- `DELETE /api/reviews/:id` - Delete a review

## Deployment on Render

### Prerequisites

1. A [Render](https://render.com) account (free tier available)
2. A MySQL database (Render provides managed MySQL or use external)

### Steps

1. **Create a new Web Service on Render:**
   - Go to [Render Dashboard](https://dashboard.render.com)
   - Click "New" → "Web Service"
   - Connect your GitHub repository
   - Select the `review-modeule-backend` repository

2. **Configure the service:**
   - **Name:** review-module-backend
   - **Region:** Choose your preferred region
   - **Branch:** main
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Plan:** Free (or choose paid for production)

3. **Add Environment Variables:**
   In the "Environment" section, add the following variables:
   
   ```
   PORT = 10000 (Render's default port)
   DB_HOST = [your-database-host]
   DB_PORT = 3306
   DB_USER = [your-database-user]
   DB_PASSWORD = [your-database-password]
   DB_NAME = [your-database-name]
   DB_SSL = true (if using SSL)
   FRONTEND_ORIGIN = [your-frontend-url]
   ```

4. **Database Setup:**
   - Option A: Use Render's managed MySQL
     - Create a new MySQL database on Render
     - Copy the connection details to your environment variables
     - Use `DATABASE_URL` format: `mysql://user:pass@host:port/dbname`
   
   - Option B: Use external MySQL
     - Ensure your database allows connections from Render's IPs
     - Add SSL certificate if required

5. **Deploy:**
   - Click "Create Web Service"
   - Render will automatically build and deploy your application
   - Monitor the deployment logs

6. **Verify Deployment:**
   - Once deployed, Render provides a URL like `https://review-module-backend.onrender.com`
   - Test the API endpoints using curl or Postman

### Render-Specific Configuration

Render automatically sets the `PORT` environment variable to `10000`. The application is configured to use this port by default.

For database SSL connections on Render:
- Enable `DB_SSL=true`
- The application includes CA certificate support for Aiven and similar providers
- For Render's managed MySQL, SSL is typically enabled by default

## Local Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# The server will run on http://localhost:3000
```

## Production Deployment

### Using Render (Recommended)

Follow the steps above for easy deployment with automatic SSL, scaling, and monitoring.

### Using Docker

```bash
# Build the image
docker build -t review-module-backend .

# Run the container
docker run -p 3000:3000 --env-file .env review-module-backend
```

### Using PM2 (Process Manager)

```bash
# Install PM2 globally
npm install -g pm2

# Start the application
pm2 start review-module-backend/data.js --name review-backend

# Save process list
pm2 save
```

## Database Schema

The application expects a MySQL database with appropriate tables for reviews. Example schema:

```sql
CREATE TABLE reviews (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  product_id INT NOT NULL,
  rating INT CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

## Security Considerations

- Always use environment variables for sensitive data
- Enable SSL for database connections in production
- Implement proper authentication/authorization (JWT, OAuth, etc.)
- Use CORS restrictions to limit frontend origins
- Keep dependencies updated
- Use connection pooling to prevent database overload

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

This project is licensed under the MIT License.

## Support

For issues and questions, please open an issue in the GitHub repository.