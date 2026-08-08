import express from "express";
import { getMasterValues } from "../controllers/master.controller.js";

const router = express.Router();

router.get("/:master", getMasterValues);

export default router;