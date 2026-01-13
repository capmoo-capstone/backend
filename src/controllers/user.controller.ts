import { Request, Response } from 'express';
import * as userService from '../service/user.service';

export const signup = async (req: Request, res: Response) => {
  // #swagger.requestBody = { schema: { $ref: '#/definitions/UserSignUp' } }
  try {
    if (!req.body.username || !req.body.full_name) {
      return res
        .status(400)
        .json({ error: 'Username and full name are required' });
    }
    const existingUser = await userService.findUserByUsername(
      req.body.username
    );
    if (existingUser) {
      return res.status(409).json({ error: 'Username already exists' });
    }
    const user = await userService.createUser(req.body);
    res.status(201).json(user);
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
};

export const getAll = async (req: Request, res: Response) => {
  try {
    const { page, limit } = req.query;
    const pageNum = parseInt(page as string) || 1;
    const limitNum = parseInt(limit as string) || 10;
    const data = await userService.listUsers(pageNum, limitNum);
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
};

export const getByUsername = async (req: Request, res: Response) => {
  const { username } = req.params;
  try {
    const user = await userService.findUserByUsername(username);
    if (user) {
      res.status(200).json(user);
    } else {
      res.status(404).json({ error: 'User not found' });
    }
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
};
