import { Request, Response } from 'express';
import * as userService from './service';

export const signup = async (req: Request, res: Response) => {
  // #swagger.requestBody = { schema: { $ref: '#/definitions/UserSignUp' } }
  try {
    const user = await userService.createUser(req.body);
    res.status(201).json(user);
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
};

export const list = async (req: Request, res: Response) => {
  try {
    const users = await userService.listUsers();
    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
};
