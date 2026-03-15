import * as fs from 'fs';
import * as path from 'path';

// Get the module name from command line (e.g., npx tsx generate.ts category)
const moduleName: string | undefined = process.argv[2];

if (!moduleName) {
  console.error('❌ Please provide a module name: npm run gen -- <name>');
  process.exit(1);
}

const lowerName = moduleName.toLowerCase();
const pascalName = moduleName.charAt(0).toUpperCase() + moduleName.slice(1);

interface FileTemplate {
  folder: string;
  fileName: string;
  content: string;
}

const templates: FileTemplate[] = [
  {
    folder: 'src/controllers',
    fileName: `${lowerName}.controller.ts`,
    content: `import { Request, Response } from 'express';\n\nexport const getAll = async (req: Request, res: Response) => {\n  try {\n    // Controller logic\n  } catch (error) {\n    res.status(500).json({ message: error });\n  }\n};`,
  },
  {
    folder: 'src/services',
    fileName: `${lowerName}.service.ts`,
    content: `import { prisma } from '../config/prisma';\n\nexport const list${pascalName}s = async () => {\n  return await prisma.${lowerName}.findMany();\n};`,
  },
  {
    folder: 'src/routes',
    fileName: `${lowerName}.route.ts`,
    content: `import { Router } from 'express';\nimport * as controller from '../controllers/${lowerName}.controller';\n\nconst router = Router();\n\nrouter.get('/', controller.getAll);\n\nexport default router;`,
  },
  {
    folder: 'src/schemas',
    fileName: `${lowerName}.schema.ts`,
    content: `export const ${pascalName}Schema = {\n  // Define your schema here\n};`,
  },
  {
    folder: 'src/types',
    fileName: `${lowerName}.type.ts`,
    content: `export interface ${pascalName} {
      id: string;
      createdAt: Date;
      updatedAt: Date;
      // Add your fields here
    }`,
  },
];

const generateFiles = () => {
  templates.forEach((t) => {
    const targetDir = path.join(process.cwd(), t.folder);
    const filePath = path.join(targetDir, t.fileName);

    // Create directory if it doesn't exist
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // Write file if it doesn't exist
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, t.content);
      console.log(`✅ Created: ${t.folder}/${t.fileName}`);
    } else {
      console.warn(`⚠️  Skipped: ${t.fileName} already exists.`);
    }
  });
};

generateFiles();
console.log('🎉 Module generation completed!');
