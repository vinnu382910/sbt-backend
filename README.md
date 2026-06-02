# Micro-Certifications Backend

Secure Node.js + Express + MongoDB backend for quizzes, results, certificates, and authentication.

## Security Model
- HTTP-only cookie JWT auth (`token` cookie).
- Registration is immediate with name, email, and password.
- Login uses email/password and sets an HTTP-only cookie.

## Email Provider
SMTP is only used for private exam assignment emails. User registration and login do not require email OTP.

## Environment Variables
Create `.env` in `backend/`:

```env
PORT=5000
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret
NODE_ENV=development
FRONTEND_URL=http://localhost:3000
# Optional comma-separated list for LAN/dev preview or multiple deployments.
# ALLOWED_ORIGINS is also supported and is the preferred production name.
FRONTEND_URLS=http://10.222.107.101:3000,https://your-frontend-domain.com
ALLOWED_ORIGINS=https://your-frontend-domain.com

SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_gmail_app_password
SMTP_APP_NAME=sbtexam

CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
CLOUDINARY_QUESTION_FOLDER=sbt-exam/questions
```

## Localhost Cookie Requirements
- Frontend: `http://localhost:3000`
- Backend: `http://localhost:5000`
- LAN dev frontend such as `http://10.222.107.101:3000` is allowed only in development.
- Development ports `3000` and `5173` are supported for private LAN origins.
- CORS credentials enabled
- Cookie in dev: `httpOnly: true`, `secure: false`, `sameSite: "lax"`
- Frontend Axios must use `withCredentials: true`

## Production Notes
For production (HTTPS):
- Set `NODE_ENV=production`
- Cookie: `secure: true`, `sameSite: "none"`, `httpOnly: true`
- Set `FRONTEND_URL` to the exact deployed frontend URL
- Use `ALLOWED_ORIGINS` for one or more trusted deployed frontend URLs
- Keep `withCredentials: true` on frontend

## Auth API Endpoints
### Public
- `POST /auth/register`
- `POST /auth/login`

### Protected
- `GET /auth/me`
- `POST /auth/logout`

## Run
```bash
npm install
npm run dev
```
