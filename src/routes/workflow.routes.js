import express from "express";

import {
    createWorkflow,
    getAllWorkflows,
    createWorkflowRun,
    submitWorkflowStage,
    getWorkflowById,
    downloadWorkflowPdf,
    getActiveWorkflowRuns,
    getWorkflowRunById,
    getWorkflowRunHistory,
    getWorkflowStageHistory
} from "../controllers/workflow.controller.js";

import {
    authenticate,
    authorize
} from "../middleware/auth.middleware.js";

const router = express.Router();

router.post(
    "/",
    authenticate,
    authorize("admin"),
    createWorkflow
);

router.post(
    "/runs",
    authenticate,
    createWorkflowRun
);

router.get(
    "/runs/history",
    authenticate,
    getWorkflowRunHistory
);

router.get(
    "/runs/:id/history",
    authenticate,
    getWorkflowStageHistory
);

router.get(
    "/runs/:id",
    authenticate,
    getWorkflowRunById
);

router.post(
    "/runs/:id/stages",
    authenticate,
    submitWorkflowStage
);

router.get(
    "/",
    authenticate,
    getAllWorkflows
);

router.get(
    "/runs",
    authenticate,
    getActiveWorkflowRuns
);

router.get(
    "/runs/:id/pdf",
    authenticate,
    downloadWorkflowPdf
);

router.get(
    "/:id",
    authenticate,
    getWorkflowById
);

export default router;