import './config/env';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import swaggerDocument from '../swagger-output.json';
import { bangkokDateResponse } from './middlewares/date-response';
import { errorHandler } from './middlewares/error';
import apiV1Routes from './routes/index';
import { logRuntimeEvent } from './utils/runtime-log';

const NODE_ENV = process.env.NODE_ENV || 'local';
const PORT = process.env.PORT || 3000;

const app = express();
app.set('trust proxy', 1);
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
      },
    },
  })
);

const allowedOrigins = [
  'http://localhost:5173',
  `http://localhost:${PORT}`,
  'https://www.nexus-procure.com',
  'https://nexus-procure.com',
  'https://vendor.nexus-procure.com',
  'https://nexus-procure.pages.dev',
  'https://dev.nexus-procure.pages.dev',
  'https://nexus-procure-vendors-portal.pages.dev',
];

const corsOptions = {
  origin: (
    origin: string | undefined,
    callback: (error: Error | null, allowed?: boolean) => void
  ) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(null, false);
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
};

app.options('/{*path}', cors(corsOptions));
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(bangkokDateResponse);

app.get('/', (_req, res) => {
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
  swaggerUrl: '/api-docs/swagger.json',
};

const swaggerServerUrls: Record<string, string> = {
  [`localhost:${PORT}`]: `http://localhost:${PORT}/api/v1`,
  'api.nexus-procure.com': 'https://api.nexus-procure.com/api/v1',
  'nexus-procure-backend.vercel.app':
    'https://nexus-procure-backend.vercel.app/api/v1',
  'dev-nexus-procure-backend.vercel.app':
    'https://dev-nexus-procure-backend.vercel.app/api/v1',
};

const getSwaggerServerUrl = (host: string | undefined) => {
  if (!host) return undefined;

  return swaggerServerUrls[host.toLowerCase()];
};

app.get('/api-docs/swagger.json', (req, res) => {
  const serverUrl = getSwaggerServerUrl(req.get('host'));

  if (!serverUrl) {
    return res.status(400).json({ message: 'Unsupported Swagger host' });
  }

  return res.json({
    ...swaggerDocument,
    servers: [{ url: serverUrl }],
  });
});

const swaggerCsp = helmet({
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
});

app.use(
  '/api-docs',
  swaggerCsp,
  swaggerUi.serve,
  swaggerUi.setup(undefined, swaggerUiOptions)
);

app.use(errorHandler);

if (NODE_ENV === 'local' || NODE_ENV === 'production') {
  app.listen(PORT, () => {
    logRuntimeEvent('backend', 'startup', {
      port: Number(PORT),
      nodeEnv: NODE_ENV,
    });
  });
}

export default app;
