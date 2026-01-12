const swaggerAutogen = require('swagger-autogen')({ openapi: '3.0.0' });

const doc = {
  info: {
    title: 'Express 5 API',
    description: 'Automatically generated documentation',
  },
  host: 'localhost:3000',
  definitions: {
    UserSignUp: {
      $username: 'johndoe',
      $full_name: 'John Doe',
      email: 'john@example.com',
      role: 'GUEST',
      unit_id: 'test-unit-uuid',
    },
  },
};

const outputFile = './swagger-output.json';
const routes = ['./src/app.ts'];

swaggerAutogen(outputFile, routes, doc);
