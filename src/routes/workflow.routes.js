import express from "express";

import { createWorkflow, getAllWorkflows } from "../controllers/workflow.controller.js";

const router = express.Router();

router.post("/", createWorkflow);
router.get("/", getAllWorkflows);

export default router;