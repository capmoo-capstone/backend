import { Request, Response } from 'express';
import * as userService from './service';
import { CreateUserSchema } from './model';

export const signup = async (req: Request, res: Response) => {
  const validation = CreateUserSchema.safeParse(req.body);

  if (!validation.success) {
    return res.status(400).json({ errors: validation.error });
  }

  const user = await userService.createUser(validation.data);

  res.status(201).json(user);
};

export const list = async (_req: Request, res: Response) => {
  const users = await userService.getAllUsers();
  res.json(users);
};
