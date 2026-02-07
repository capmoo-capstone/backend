import { Request, Response } from 'express';
import * as SubmissionService from '../service/submission.service';
import {
  CreateSubmissionSchema,
  StatusSubmissionSchema,
  RejectSubmissionSchema,
} from '../models/Submission';

export const getProjectSubmissions = async (req: Request, res: Response) => {
  // #swagger.tags = ['Submission']
  // #swagger.security = [{ bearerAuth: [] }]
  const { id } = (req as any).user;
  const { projectId } = req.params;

  const submissions = await SubmissionService.getProjectSubmissions(
    { id },
    projectId
  );
  res.status(200).json(submissions);
};

export const createSubmission = async (req: Request, res: Response) => {
  // #swagger.tags = ['Submission']
  // #swagger.security = [{ bearerAuth: [] }]
  const { id } = (req as any).user;

  const validateData = CreateSubmissionSchema.parse(req.body);
  const submission = await SubmissionService.createStaffSubmissionsProject(
    { id },
    validateData
  );
  res.status(201).json(submission);
};

export const approveSubmission = async (req: Request, res: Response) => {
  // #swagger.tags = ['Submission']
  // #swagger.security = [{ bearerAuth: [] }]
  const { id } = (req as any).user;
  const { id: submissionId } = req.params;

  const validateData = StatusSubmissionSchema.parse({
    id: submissionId,
    step_id: req.body.stepId,
  });
  const submission = await SubmissionService.approveSubmission(
    { id },
    validateData
  );
  res.status(200).json(submission);
};

export const proposeSubmission = async (req: Request, res: Response) => {
  // #swagger.tags = ['Submission']
  // #swagger.security = [{ bearerAuth: [] }]
  const { id } = (req as any).user;
  const { id: submissionId } = req.params;

  const validateData = StatusSubmissionSchema.parse({
    id: submissionId,
  });
  const submission = await SubmissionService.proposeSubmission(
    { id },
    validateData
  );
  res.status(200).json(submission);
};

export const finishProposedSubmission = async (req: Request, res: Response) => {
  // #swagger.tags = ['Submission']
  // #swagger.security = [{ bearerAuth: [] }]
  const { id } = (req as any).user;
  const { id: submissionId } = req.params;

  const validateData = StatusSubmissionSchema.parse({
    id: submissionId,
  });
  const submission = await SubmissionService.finishProposedSubmission(
    { id },
    validateData
  );
  res.status(200).json(submission);
};

export const rejectSubmission = async (req: Request, res: Response) => {
  // #swagger.tags = ['Submission']
  // #swagger.security = [{ bearerAuth: [] }]
  const { id } = (req as any).user;
  const { id: submissionId } = req.params;

  const validateData = RejectSubmissionSchema.parse({
    id: submissionId,
    comment: req.body.comment,
  });
  const submission = await SubmissionService.rejectSubmission(
    { id },
    validateData
  );
  res.status(200).json(submission);
};
