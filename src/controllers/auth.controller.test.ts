import { afterEach, describe, expect, it, vi } from 'vitest';
import * as AuthService from '../services/auth.service';
import * as SamlService from '../services/saml.service';
import {
  SSO_FAILURE_CODES,
  SsoAuthenticationError,
  UnauthorizedError,
} from '../utils/errors';
import { samlAcs } from './auth.controller';

const claims = {
  screenName: 'portal.staff',
  emailAddress: 'staff@chula.ac.th',
  firstName: 'Portal',
  lastName: 'Staff',
};

const createResponse = () => ({ redirect: vi.fn() });

describe('samlAcs', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('redirects a successful SSO login with its exchange code', async () => {
    vi.spyOn(SamlService, 'validateSamlResponse').mockResolvedValue(claims);
    vi.spyOn(AuthService, 'loginWithSamlClaims').mockResolvedValue(
      'exchange-code'
    );
    vi.spyOn(SamlService, 'getSamlFrontendRedirectUrl').mockReturnValue(
      'https://www.example.chula.ac.th/login'
    );
    const res = createResponse();
    const next = vi.fn();

    await samlAcs(
      { body: { SAMLResponse: 'encoded-response' } } as any,
      res as any,
      next
    );

    expect(res.redirect).toHaveBeenCalledWith(
      303,
      'https://www.example.chula.ac.th/login?code=exchange-code'
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('redirects recognized account failures with their stable error code', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(SamlService, 'validateSamlResponse').mockResolvedValue(claims);
    vi.spyOn(AuthService, 'loginWithSamlClaims').mockRejectedValue(
      new SsoAuthenticationError(
        SSO_FAILURE_CODES.REGISTRATION_PENDING,
        'Registration request is pending approval'
      )
    );
    vi.spyOn(SamlService, 'getSamlFrontendRedirectUrl').mockReturnValue(
      'https://www.example.chula.ac.th/login?source=sso&error=old&error=duplicate'
    );
    const res = createResponse();
    const next = vi.fn();

    await samlAcs(
      { body: { SAMLResponse: 'encoded-response' } } as any,
      res as any,
      next
    );

    expect(res.redirect).toHaveBeenCalledOnce();
    const redirectUrl = new URL(res.redirect.mock.calls[0][1]);
    expect(res.redirect.mock.calls[0][0]).toBe(303);
    expect(redirectUrl.searchParams.get('source')).toBe('sso');
    expect(redirectUrl.searchParams.getAll('error')).toEqual([
      SSO_FAILURE_CODES.REGISTRATION_PENDING,
    ]);
    expect(next).not.toHaveBeenCalled();
  });

  it('maps invalid SAML responses to the generic sso_failed code', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(SamlService, 'validateSamlResponse').mockRejectedValue(
      new UnauthorizedError('Invalid SAML response')
    );
    const loginSpy = vi.spyOn(AuthService, 'loginWithSamlClaims');
    vi.spyOn(SamlService, 'getSamlFrontendRedirectUrl').mockReturnValue(
      'https://www.example.chula.ac.th/login'
    );
    const res = createResponse();

    await samlAcs(
      { body: { SAMLResponse: 'invalid-response' } } as any,
      res as any,
      vi.fn()
    );

    expect(loginSpy).not.toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith(
      303,
      'https://www.example.chula.ac.th/login?error=sso_failed'
    );
  });

  it('maps unexpected technical failures to the generic sso_failed code', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(SamlService, 'validateSamlResponse').mockResolvedValue(claims);
    vi.spyOn(AuthService, 'loginWithSamlClaims').mockRejectedValue(
      new Error('Database unavailable')
    );
    vi.spyOn(SamlService, 'getSamlFrontendRedirectUrl').mockReturnValue(
      'https://www.example.chula.ac.th/login'
    );
    const res = createResponse();

    await samlAcs(
      { body: { SAMLResponse: 'encoded-response' } } as any,
      res as any,
      vi.fn()
    );

    expect(res.redirect).toHaveBeenCalledWith(
      303,
      'https://www.example.chula.ac.th/login?error=sso_failed'
    );
  });
});
