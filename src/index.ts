import express from 'express';
import { prisma } from './prisma.js';

const app = express();
app.use(express.json());

// Create a User
app.post('/users', async (req, res) => {
  const { email, name } = req.body;
  const user = await prisma.user.create({
    data: { email, name },
  });
  res.json(user);
});

// Get all Users with their Posts
app.get('/users', async (req, res) => {
  const users = await prisma.user.findMany({
    include: { posts: true },
  });
  res.json(users);
});

app.listen(3000, () => console.log('🚀 Server ready at: http://localhost:3000'));