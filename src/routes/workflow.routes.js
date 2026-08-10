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

const router = express.Router();

router.post(
    "/",
    createWorkflow
);

router.post(
    "/runs",
    createWorkflowRun
);

router.get(
    "/runs/history",
    getWorkflowRunHistory
);

router.get(
    "/runs/:id/history",
    getWorkflowStageHistory
);

router.get(
    "/runs/:id",
    getWorkflowRunById
);

router.post(
    "/runs/:id/stages",
    submitWorkflowStage
);

router.get(
    "/",
    getAllWorkflows
);

router.get(
    "/runs",
    getActiveWorkflowRuns
);

router.get(
    "/runs/:id/pdf",
    downloadWorkflowPdf
);

router.get(
    "/:id",
    getWorkflowById
);

export default router;