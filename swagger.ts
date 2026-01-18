const swaggerAutogen = require('swagger-autogen')({ openapi: '3.0.0' });

const doc = {
  info: {
    title: 'Express 5 API',
    description: 'Automatically generated documentation',
  },
  host: 'localhost:3000',
  schemes: ['http'],
  basePath: '/api/v1',
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
  },
};

const outputFile = './swagger-output.json';
const routes = ['./src/routes/index.ts'];

swaggerAutogen(outputFile, routes, doc);
