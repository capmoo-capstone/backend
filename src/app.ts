import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import apiV1Routes from './routes/index';
import { errorHandler } from './middlewares/error';

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());

// Import API v1 routes
app.get('/', (req, res, next) => {
  res.status(200).send('Welcome to the API');
});
app.use('/api/v1', apiV1Routes);

app.use(errorHandler);

export default app;
