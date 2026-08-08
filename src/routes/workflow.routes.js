import express from "express";

import { 
    createWorkflow, 
    getAllWorkflows, 
    createWorkflowRun, 
    getWorkflowById, 
    downloadWorkflowPdf 
} from "../controllers/workflow.controller.js";

const router = express.Router();

router.post("/", createWorkflow);
router.post("/runs", createWorkflowRun);
router.get("/", getAllWorkflows);
router.get("/runs/:id/pdf",downloadWorkflowPdf);
router.get("/:id", getWorkflowById);

export default router;