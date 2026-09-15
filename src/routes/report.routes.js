import express from "express";

import {
    getReportTypes,
    generateInOutReport,
    generateStockReport
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

router.get(
    "/stock",
    generateStockReport
);

export default router;
