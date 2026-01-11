import { prisma } from '../src/lib/prisma';
import bcrypt from 'bcrypt';

async function main() {
  console.log('🌱 Starting seeding...');

  // 1. Clean existing data (optional, but prevents duplicates)
  await prisma.user.deleteMany();

  // 2. Create a demo user
  const hashedPassword = await bcrypt.hash('password123', 10);

  const admin = await prisma.user.create({
    data: {
      email: 'admin@example.com',
      name: 'Admin User',
      // password: hashedPassword, // Uncomment if your schema has this
    },
  });

  console.log({ admin });
  console.log('✅ Seeding finished.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
