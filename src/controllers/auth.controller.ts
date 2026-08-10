import { NextFunction, Request, Response } from 'express';
import * as AuthService from '../services/auth.service';
import { RegisterUserSchema } from '../schemas/user.schema';
import { AuthenticatedRequest } from '../types/auth.type';
import { BadRequestError } from '../lib/errors';
import { createSsoExchangeCode } from '../lib/saml-cache';
import {
  createSamlLoginUrl,
  getSamlFrontendFailureUrl,
  getSamlFrontendSuccessUrl,
  getSamlMetadata,
  validateSamlResponse,
} from '../services/saml.service';

export const login = async (req: Request, res: Response) => {
  // #swagger.tags = ['Auth']
  const { username, password } = req.body;
  const data = await AuthService.login(username, password);
  res.status(200).json(data);
};

export const register = async (req: Request, res: Response) => {
  // #swagger.tags = ['Auth']
  const { username, password, full_name, email, role, dept_id, unit_id } =
    req.body;
  const validatedData = RegisterUserSchema.parse({
    username,
    password,
    full_name,
    email,
    role,
    dept_id,
    unit_id,
  });
  const data = await AuthService.register(validatedData);
  res.status(201).json(data);
};

export const getMe = async (req: AuthenticatedRequest, res: Response) => {
  // #swagger.tags = ['Auth']
  // #swagger.security = [{ bearerAuth: [] }]
  const payload = req.user!;
  res.status(200).json(payload);
};

export const logout = async (req: AuthenticatedRequest, res: Response) => {
  // #swagger.tags = ['Auth']
  // #swagger.security = [{ bearerAuth: [] }]
  const payload = req.user!;
  await AuthService.logout(payload);
  res.status(200).json({ message: 'Logged out successfully' });
};

export const samlMetadata = async (_req: Request, res: Response) => {
  // #swagger.tags = ['Auth']
  res.type('application/xml').send(getSamlMetadata());
};

export const startSamlLogin = async (req: Request, res: Response) => {
  // #swagger.tags = ['Auth']
  const loginUrl = await createSamlLoginUrl(req.get('host'));
  res.redirect(302, loginUrl);
};

export const samlAcs = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // #swagger.tags = ['Auth']
  try {
    const claims = await validateSamlResponse(req.body?.SAMLResponse);
    const code = await AuthService.loginWithSamlClaims(claims);

    const successUrl = new URL(getSamlFrontendSuccessUrl());
    successUrl.searchParams.set('code', code);

    res.redirect(303, successUrl.toString());
  } catch (err) {
    console.error(
      'SAML assertion consumer service failed:',
      err instanceof Error ? err.message : 'Unknown error'
    );

    try {
      res.redirect(303, getSamlFrontendFailureUrl());
    } catch (configurationError) {
      next(configurationError);
    }
  }
};

export const exchangeSsoCode = async (req: Request, res: Response) => {
  // #swagger.tags = ['Auth']
  const { code } = req.body;
  if (!code || typeof code !== 'string') {
    throw new BadRequestError('SSO exchange code is required');
  }

  const loginData = await AuthService.exchangeSsoCode(code);
  res.status(200).json(loginData);
};
