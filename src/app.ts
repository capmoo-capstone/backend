import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import apiV1Routes from './modules/index';
import swaggerUi from 'swagger-ui-express';
import swaggerDocument from '../swagger-output.json';

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());

// Import API v1 routes
app.use('/api/v1', apiV1Routes);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

app.listen(process.env.PORT || 3000, () =>
  console.log(
    `🚀 Server ready at: http://localhost:${process.env.PORT || 3000}`
  )
);
