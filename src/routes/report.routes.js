import express from "express";

import {
    getReportTypes,
    generateInOutReport
} from "../controllers/report.controller.js";

const router =
    express.Router();

router.get(
    "/types",
    getReportTypes
);

router.get(
    "/in-out",
    generateInOutReport
);

export default router;