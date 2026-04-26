import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import apiV1Routes from './routes/index';
import { errorHandler } from './middlewares/error';
import swaggerUi from 'swagger-ui-express';
import swaggerDocument from '../swagger-output.json';

const NODE_ENV = process.env.NODE_ENV || 'local';
const PORT = process.env.PORT || 3000;

const app = express();
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "'unsafe-eval'",
          'https://cdnjs.cloudflare.com',
        ],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://cdnjs.cloudflare.com'],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
      },
    },
  })
);
const allowedOrigins = [
  'http://localhost:5173', // Vite local dev
  'http://localhost:3000', // Express local dev
  'https://nexus-procure.pages.dev', // Cloudflare Pages production
  'https://dev-nexus-procure.pages.dev', // Cloudflare Pages development
  'https://nexus-procure.vercel.app', // Vercel production
  'https://dev-nexus-procure.vercel.app', // Vercel development
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: origin ${origin} not allowed`));
      }
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
);
app.options('/{*path}', cors());
app.use(express.json());

// Import API v1 routes
app.get('/', (req, res, next) => {
  res.status(200).send('Welcome to the API');
});
app.use('/api/v1', apiV1Routes);

const swaggerUiOptions: swaggerUi.SwaggerUiOptions = {
  customCssUrl:
    'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.17.14/swagger-ui.min.css',
  customJs: [
    'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.17.14/swagger-ui-bundle.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.17.14/swagger-ui-standalone-preset.min.js',
  ],
};

const serverUrl =
  process.env.NODE_ENV === 'production'
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}/api/v1`
    : process.env.NODE_ENV === 'development'
      ? `https://dev-nexus-procure-backend.vercel.app/api/v1`
      : 'http://localhost:3000/api/v1';

(swaggerDocument as any).servers = [{ url: serverUrl }];

app.use(
  '/api-docs',
  swaggerUi.serve,
  swaggerUi.setup(swaggerDocument, swaggerUiOptions)
);

app.use(errorHandler);

// Only listen locally — Vercel handles the server itself
if (NODE_ENV === 'local') {
  app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
  });
}

export default app;
